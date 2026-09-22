-- Use the synchronized Supabase catalog as Fusion's public source of truth.
-- Adult-oriented sexual content remains excluded by games.adult_content; age,
-- horror, violence and strong-language metadata do not exclude a game by themselves.

create or replace view public.fusion_public_games
with (security_invoker = true)
as
select g.*
from public.games g
left join public.catalog_content_overrides o
  on o.steam_app_id = g.steam_app_id
where g.is_visible = true
  and g.adult_content = false
  and coalesce(o.approved, true) = true;

grant select on public.fusion_public_games
to anon, authenticated, service_role;

create or replace function public.browse_fusion_catalog(
  p_query text default '',
  p_filter text default 'Todos',
  p_sort text default 'popular',
  p_offset integer default 0,
  p_limit integer default 21
)
returns setof public.games
language sql
stable
set search_path = ''
as $$
with params as (
  select
    nullif(btrim(left(coalesce(p_query, ''), 80)), '') as q,
    coalesce(nullif(btrim(p_filter), ''), 'Todos') as f,
    case
      when p_sort in ('popular', 'recentes', 'nome') then p_sort
      else 'popular'
    end as s,
    least(greatest(coalesce(p_limit, 21), 1), 21) as lim,
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
  p.f = 'Todos'
  or (p.f = 'Coop local' and g.local_coop)
  or (
    p.f = 'Com fontes'
    and exists (
      select 1
      from public.game_source_cache c,
           jsonb_array_elements(c.sources) s
      where c.steam_app_id = g.steam_app_id
        and s ->> 'availability' is distinct from 'unavailable'
        and nullif(s ->> 'url', '') is not null
    )
  )
  or exists (
    select 1
    from unnest(g.genres || g.categories || g.tags) item
    where lower(item) in (
      lower(p.f),
      case lower(p.f)
        when 'ação' then 'action'
        when 'aventura' then 'adventure'
        when 'terror' then 'horror'
        when 'estratégia' then 'strategy'
        when 'simulação' then 'simulation'
        else lower(p.f)
      end
    )
  )
)
order by
  case when p.s = 'popular' then g.popularity_score end desc nulls last,
  case when p.s = 'recentes' then g.release_date end desc nulls last,
  case when p.s = 'nome' then lower(g.title) end asc nulls last,
  lower(g.title),
  g.id
limit (select lim from params)
offset (select off from params);
$$;

revoke all on function public.browse_fusion_catalog(text,text,text,integer,integer)
from public;

grant execute on function public.browse_fusion_catalog(text,text,text,integer,integer)
to anon, authenticated, service_role;
