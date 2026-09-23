create or replace function public.browse_fusion_catalog_v2(
  p_query text default ''::text,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'popular'::text,
  p_offset integer default 0,
  p_limit integer default 20
)
returns setof public.games
language sql
stable
set search_path to ''
as $function$
with params as (
  select
    nullif(btrim(left(coalesce(p_query, ''), 80)), '') as q,
    coalesce(p_filters, '{}'::jsonb) as f,
    case when p_sort in ('popular', 'recentes', 'nome') then p_sort else 'popular' end as s,
    least(greatest(coalesce(p_limit, 20), 1), 21) as lim,
    greatest(coalesce(p_offset, 0), 0) as off
)
select g.*
from public.fusion_public_games g
cross join params p
where (
  p.q is null
  or g.search_vector @@ websearch_to_tsquery('simple'::regconfig, p.q)
  or g.title operator(extensions.%) p.q
  or g.title ilike '%' || p.q || '%'
)
and (
  not (p.f ? 'genres')
  or jsonb_array_length(coalesce(p.f -> 'genres', '[]'::jsonb)) = 0
  or not exists (
    select 1
    from jsonb_array_elements_text(coalesce(p.f -> 'genres', '[]'::jsonb)) wanted
    where position(
      E'\x1f' || lower(wanted) || E'\x1f'
      in E'\x1f' || lower(array_to_string(coalesce(g.genres, '{}'::text[]), E'\x1f')) || E'\x1f'
    ) = 0
  )
)
and (
  not (p.f ? 'tags')
  or jsonb_array_length(coalesce(p.f -> 'tags', '[]'::jsonb)) = 0
  or not exists (
    select 1
    from jsonb_array_elements_text(coalesce(p.f -> 'tags', '[]'::jsonb)) wanted
    where position(
      E'\x1f' || lower(wanted) || E'\x1f'
      in E'\x1f' || lower(array_to_string(
        coalesce(g.tags, '{}'::text[])
        || coalesce(g.genres, '{}'::text[])
        || coalesce(g.categories, '{}'::text[]),
        E'\x1f'
      )) || E'\x1f'
    ) = 0
  )
)
and (
  not (p.f ? 'modes')
  or jsonb_array_length(coalesce(p.f -> 'modes', '[]'::jsonb)) = 0
  or not exists (
    select 1
    from jsonb_array_elements_text(coalesce(p.f -> 'modes', '[]'::jsonb)) mode
    where not (
      case mode
        when 'single_player' then 2 = any(g.steam_category_ids)
        when 'multiplayer' then 1 = any(g.steam_category_ids)
        when 'coop_any' then 9 = any(g.steam_category_ids)
        when 'online_coop' then 38 = any(g.steam_category_ids)
        when 'local_coop' then 39 = any(g.steam_category_ids)
        when 'same_screen' then g.steam_category_ids && array[24,37,39]::integer[]
        when 'lan_coop' then 48 = any(g.steam_category_ids)
        when 'online_pvp' then 36 = any(g.steam_category_ids)
        when 'local_pvp' then 37 = any(g.steam_category_ids)
        when 'crossplay' then 27 = any(g.steam_category_ids)
        when 'remote_together' then 44 = any(g.steam_category_ids)
        else true
      end
    )
  )
)
and (
  coalesce((p.f ->> 'has_source')::boolean, false) = false
  or exists (
    select 1
    from public.game_source_cache c
    where c.steam_app_id = g.steam_app_id
      and jsonb_path_exists(
        c.sources,
        '$[*] ? (@.url != null && @.url != "" && (!exists(@.availability) || @.availability != "unavailable"))'
      )
  )
)
and (
  coalesce((p.f ->> 'nucleus')::boolean, false) = false
  or exists (
    select 1
    from public.nucleus_support_cache n
    where n.steam_app_id = g.steam_app_id
      and n.supported = true
      and n.checked_at > now() - interval '30 days'
  )
)
and (
  coalesce(p.f ->> 'controller', '') = ''
  or case p.f ->> 'controller'
    when 'full' then 28 = any(g.steam_category_ids)
    when 'any' then g.steam_category_ids && array[18,28,60]::integer[]
    else true
  end
)
order by
  case when p.s = 'popular' then g.popularity_score end desc nulls last,
  case when p.s = 'recentes' then g.release_date end desc nulls last,
  case when p.s = 'nome' then lower(g.title) end asc nulls last,
  lower(g.title),
  g.id
limit (select lim from params)
offset (select off from params);
$function$;
