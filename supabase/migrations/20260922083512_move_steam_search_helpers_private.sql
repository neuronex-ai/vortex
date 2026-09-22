create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.search_steam_fallback_ids_impl(
  p_query text,
  p_limit integer default 8
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text;
  v_limit integer;
  v_cached bigint[];
  v_status integer;
  v_payload jsonb;
  v_ids bigint[] := '{}'::bigint[];
  v_safe_ids bigint[] := '{}'::bigint[];
  v_app_id bigint;
begin
  v_query := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 8);

  if char_length(v_query) < 2 or char_length(v_query) > 80 then return '{}'::bigint[]; end if;

  select app_ids into v_cached
  from public.steam_search_cache
  where query_key = v_query and searched_at > now() - interval '30 minutes';

  if v_cached is not null then return v_cached; end if;

  select h.status, h.content::jsonb into v_status, v_payload
  from extensions.http_get(
    'https://store.steampowered.com/api/storesearch/?term='
    || extensions.urlencode(v_query::varchar)
    || '&l=portuguese&cc=BR'
  ) h;

  if v_status <> 200 then return '{}'::bigint[]; end if;

  select coalesce(array_agg(app_id order by ord), '{}'::bigint[])
    into v_ids
  from (
    select (item ->> 'id')::bigint as app_id, ord
    from jsonb_array_elements(coalesce(v_payload -> 'items', '[]'::jsonb))
      with ordinality t(item, ord)
    where item ->> 'type' = 'app' and nullif(item ->> 'id', '') is not null
    order by ord
    limit v_limit
  ) candidates;

  foreach v_app_id in array v_ids loop
    perform public.sync_steam_app(v_app_id);
  end loop;

  select coalesce(array_agg(g.steam_app_id order by u.ord), '{}'::bigint[])
    into v_safe_ids
  from unnest(v_ids) with ordinality u(app_id, ord)
  join public.games g on g.steam_app_id = u.app_id
  where g.is_visible = true and g.adult_content = false;

  insert into public.steam_search_cache(query_key, app_ids, searched_at)
  values (v_query, v_safe_ids, now())
  on conflict (query_key) do update set app_ids = excluded.app_ids, searched_at = now();

  return v_safe_ids;
end;
$$;

create or replace function private.ensure_steam_game_impl(p_app_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id bigint;
  v_last_sync timestamptz;
  v_has_gallery boolean;
begin
  select id, last_synced_at, jsonb_array_length(screenshots) > 0
    into v_game_id, v_last_sync, v_has_gallery
  from public.games
  where steam_app_id = p_app_id and is_visible = true and adult_content = false;

  if v_game_id is not null
     and v_has_gallery
     and v_last_sync > now() - interval '7 days' then
    return v_game_id;
  end if;

  perform public.sync_steam_app(p_app_id);

  select id into v_game_id
  from public.games
  where steam_app_id = p_app_id and is_visible = true and adult_content = false;

  return v_game_id;
end;
$$;

revoke all on function private.search_steam_fallback_ids_impl(text,integer) from public;
revoke all on function private.ensure_steam_game_impl(bigint) from public;
grant execute on function private.search_steam_fallback_ids_impl(text,integer) to anon, authenticated;
grant execute on function private.ensure_steam_game_impl(bigint) to anon, authenticated;

create or replace function public.search_steam_fallback_ids(
  p_query text,
  p_limit integer default 8
)
returns bigint[]
language sql
security invoker
set search_path = ''
as $$
  select private.search_steam_fallback_ids_impl(p_query, p_limit);
$$;

create or replace function public.ensure_steam_game(p_app_id bigint)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.ensure_steam_game_impl(p_app_id);
$$;

revoke all on function public.search_steam_fallback_ids(text,integer) from public;
revoke all on function public.ensure_steam_game(bigint) from public;
grant execute on function public.search_steam_fallback_ids(text,integer) to anon, authenticated;
grant execute on function public.ensure_steam_game(bigint) to anon, authenticated;
