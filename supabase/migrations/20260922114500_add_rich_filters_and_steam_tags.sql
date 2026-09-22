-- Rich Steam taxonomy and composable Fusion catalog filters.

alter table public.games
  add column if not exists steam_tag_ids integer[] not null default '{}',
  add column if not exists franchises text[] not null default '{}';

create table if not exists public.steam_tag_dictionary (
  tag_id integer primary key,
  name text not null,
  version_hash text,
  updated_at timestamptz not null default now()
);

alter table public.steam_tag_dictionary enable row level security;
revoke all on public.steam_tag_dictionary from anon, authenticated;
grant all on public.steam_tag_dictionary to service_role;

create table if not exists public.nucleus_support_cache (
  steam_app_id bigint primary key references public.games(steam_app_id) on delete cascade,
  title text not null,
  supported boolean not null default false,
  verified boolean not null default false,
  max_players integer,
  handler_count integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now()
);

alter table public.nucleus_support_cache enable row level security;
revoke all on public.nucleus_support_cache from public;
grant select on public.nucleus_support_cache to anon, authenticated, service_role;
grant all on public.nucleus_support_cache to service_role;

drop policy if exists "public can read nucleus compatibility" on public.nucleus_support_cache;
create policy "public can read nucleus compatibility"
on public.nucleus_support_cache
for select
to anon, authenticated
using (true);

create or replace function public.refresh_steam_tag_dictionary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_status integer;
  v_payload jsonb;
  v_hash text;
  v_count integer := 0;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  limit 1;

  if nullif(v_key, '') is null then
    return jsonb_build_object('ok', false, 'error', 'steam_web_api_key missing');
  end if;

  select h.status, h.content::jsonb
    into v_status, v_payload
  from extensions.http_get(
    'https://api.steampowered.com/IStoreService/GetTagList/v1/?key=' ||
    extensions.urlencode(v_key::varchar) ||
    '&language=brazilian'
  ) h;

  if v_status <> 200 then
    return jsonb_build_object('ok', false, 'status', v_status);
  end if;

  v_hash := v_payload #>> '{response,version_hash}';

  insert into public.steam_tag_dictionary(tag_id, name, version_hash, updated_at)
  select
    (tag ->> 'tagid')::integer,
    btrim(tag ->> 'name'),
    v_hash,
    now()
  from jsonb_array_elements(coalesce(v_payload #> '{response,tags}', '[]'::jsonb)) tag
  where nullif(tag ->> 'tagid', '') is not null
    and nullif(btrim(tag ->> 'name'), '') is not null
  on conflict (tag_id) do update set
    name = excluded.name,
    version_hash = excluded.version_hash,
    updated_at = now();

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'updated', v_count, 'version_hash', v_hash);
end;
$$;

revoke all on function public.refresh_steam_tag_dictionary() from public, anon, authenticated;
grant execute on function public.refresh_steam_tag_dictionary() to service_role;

create or replace function public.enrich_steam_store_metadata(p_app_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_ids bigint[];
  v_input jsonb;
  v_status integer;
  v_payload jsonb;
  v_item jsonb;
  v_app_id bigint;
  v_tag_ids integer[];
  v_tags text[];
  v_franchises text[];
  v_updated integer := 0;
begin
  select coalesce(array_agg(distinct id order by id), '{}'::bigint[])
    into v_ids
  from (
    select value::bigint as id
    from unnest(coalesce(p_app_ids, '{}'::bigint[])) value
    where value::bigint > 0
    limit 50
  ) q;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'updated', 0);
  end if;

  if not exists (
    select 1 from public.steam_tag_dictionary
    where updated_at > now() - interval '24 hours'
  ) then
    perform public.refresh_steam_tag_dictionary();
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  limit 1;

  if nullif(v_key, '') is null then
    return jsonb_build_object('ok', false, 'error', 'steam_web_api_key missing');
  end if;

  select jsonb_build_object(
    'ids', jsonb_agg(jsonb_build_object('appid', id) order by id),
    'context', jsonb_build_object('language', 'brazilian', 'country_code', 'BR'),
    'data_request', jsonb_build_object(
      'include_basic_info', true,
      'include_tag_count', 20
    )
  )
  into v_input
  from unnest(v_ids) id;

  select h.status, h.content::jsonb
    into v_status, v_payload
  from extensions.http_get(
    'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?key=' ||
    extensions.urlencode(v_key::varchar) ||
    '&input_json=' || extensions.urlencode(v_input::text::varchar)
  ) h;

  if v_status <> 200 then
    return jsonb_build_object('ok', false, 'status', v_status);
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_payload #> '{response,store_items}', '[]'::jsonb))
  loop
    v_app_id := coalesce(
      nullif(v_item ->> 'appid', '')::bigint,
      nullif(v_item ->> 'id', '')::bigint
    );

    if v_app_id is null then
      continue;
    end if;

    select coalesce(array_agg(value::integer), '{}'::integer[])
      into v_tag_ids
    from jsonb_array_elements_text(coalesce(v_item -> 'tagids', '[]'::jsonb)) value;

    select coalesce(array_agg(d.name order by u.ord), '{}'::text[])
      into v_tags
    from unnest(v_tag_ids) with ordinality u(tag_id, ord)
    join public.steam_tag_dictionary d on d.tag_id = u.tag_id;

    select coalesce(array_agg(btrim(value ->> 'name')) filter (where nullif(btrim(value ->> 'name'), '') is not null), '{}'::text[])
      into v_franchises
    from jsonb_array_elements(coalesce(v_item #> '{basic_info,franchises}', '[]'::jsonb)) value;

    update public.games g
    set
      steam_tag_ids = v_tag_ids,
      tags = v_tags,
      franchises = v_franchises,
      search_text = concat_ws(
        ' ',
        g.title,
        g.short_description,
        array_to_string(g.genres, ' '),
        array_to_string(g.categories, ' '),
        array_to_string(v_tags, ' '),
        array_to_string(v_franchises, ' '),
        array_to_string(g.developers, ' '),
        array_to_string(g.publishers, ' ')
      ),
      updated_at = now()
    where g.steam_app_id = v_app_id;

    if found then
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'updated', v_updated, 'requested', cardinality(v_ids));
end;
$$;

revoke all on function public.enrich_steam_store_metadata(bigint[]) from public, anon, authenticated;
grant execute on function public.enrich_steam_store_metadata(bigint[]) to service_role;

create or replace function public.steam_more_like_this_ids(
  p_app_id bigint,
  p_count integer default 24
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_input jsonb;
  v_status integer;
  v_payload jsonb;
  v_ids bigint[] := '{}'::bigint[];
  v_id bigint;
  v_count integer := least(greatest(coalesce(p_count, 24), 1), 30);
begin
  if p_app_id is null or p_app_id <= 0 then
    return '{}'::bigint[];
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  limit 1;

  if nullif(v_key, '') is null then
    return '{}'::bigint[];
  end if;

  v_input := jsonb_build_object(
    'item_id', jsonb_build_object('appid', p_app_id),
    'context', jsonb_build_object('language', 'brazilian', 'country_code', 'BR'),
    'data_request', jsonb_build_object('include_basic_info', true, 'include_tag_count', 20),
    'count', v_count
  );

  select h.status, h.content::jsonb
    into v_status, v_payload
  from extensions.http_get(
    'https://api.steampowered.com/IStoreQueryService/MoreLikeThis/v1/?key=' ||
    extensions.urlencode(v_key::varchar) ||
    '&input_json=' || extensions.urlencode(v_input::text::varchar)
  ) h;

  if v_status = 200 then
    select coalesce(array_agg(app_id order by ord), '{}'::bigint[])
      into v_ids
    from (
      select
        coalesce(nullif(item ->> 'appid', '')::bigint, nullif(item ->> 'id', '')::bigint) as app_id,
        ord
      from jsonb_array_elements(coalesce(v_payload #> '{response,store_items}', '[]'::jsonb))
      with ordinality x(item, ord)
      where coalesce(nullif(item ->> 'appid', ''), nullif(item ->> 'id', '')) is not null
      order by ord
      limit v_count
    ) q
    where app_id <> p_app_id;
  end if;

  if cardinality(v_ids) = 0 then
    select coalesce(array_agg(g.steam_app_id order by
      (
        select count(*)
        from unnest(g.tags) gt
        where gt = any(ref.tags)
      ) desc,
      (
        select count(*)
        from unnest(g.genres) gg
        where gg = any(ref.genres)
      ) desc,
      g.popularity_score desc
    ), '{}'::bigint[])
    into v_ids
    from public.fusion_public_games g
    cross join lateral (
      select r.tags, r.genres
      from public.fusion_public_games r
      where r.steam_app_id = p_app_id
    ) ref
    where g.steam_app_id <> p_app_id
    limit v_count;
  end if;

  foreach v_id in array v_ids loop
    if not exists (select 1 from public.games where steam_app_id = v_id) then
      perform public.sync_steam_app(v_id);
    end if;
  end loop;

  if cardinality(v_ids) > 0 then
    perform public.enrich_steam_store_metadata(v_ids);
  end if;

  return v_ids;
end;
$$;

revoke all on function public.steam_more_like_this_ids(bigint,integer) from public;
grant execute on function public.steam_more_like_this_ids(bigint,integer) to anon, authenticated, service_role;

create or replace function public.browse_fusion_catalog_v2(
  p_query text default '',
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'popular',
  p_offset integer default 0,
  p_limit integer default 20
)
returns setof public.games
language sql
stable
security invoker
set search_path = ''
as $$
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
    where not exists (
      select 1 from unnest(g.genres) actual
      where lower(actual) = lower(wanted)
    )
  )
)
and (
  not (p.f ? 'tags')
  or jsonb_array_length(coalesce(p.f -> 'tags', '[]'::jsonb)) = 0
  or not exists (
    select 1
    from jsonb_array_elements_text(coalesce(p.f -> 'tags', '[]'::jsonb)) wanted
    where not exists (
      select 1 from unnest(g.tags || g.genres || g.categories) actual
      where lower(actual) = lower(wanted)
    )
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
    cross join lateral jsonb_array_elements(c.sources) src(value)
    where c.steam_app_id = g.steam_app_id
      and nullif(src.value ->> 'url', '') is not null
      and src.value ->> 'availability' is distinct from 'unavailable'
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
$$;

revoke all on function public.browse_fusion_catalog_v2(text,jsonb,text,integer,integer) from public;
grant execute on function public.browse_fusion_catalog_v2(text,jsonb,text,integer,integer)
to anon, authenticated, service_role;

create index if not exists games_steam_tag_ids_gin_idx
  on public.games using gin (steam_tag_ids);

create index if not exists games_category_ids_gin_idx
  on public.games using gin (steam_category_ids);

create index if not exists games_tags_gin_idx
  on public.games using gin (tags);
