create or replace function public.discover_steam_catalog_page(
  p_last_appid bigint default 0,
  p_max_results integer default 1000,
  p_if_modified_since bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_input jsonb;
  v_url text;
  v_status integer;
  v_content text;
  v_payload jsonb;
  v_apps jsonb;
  v_count integer := 0;
  v_next_last_appid bigint := greatest(coalesce(p_last_appid, 0), 0);
  v_has_more boolean := false;
begin
  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  order by created_at desc
  limit 1;

  if v_key is null or v_key = '' then
    raise exception 'Steam Web API key is not configured in Vault as steam_web_api_key';
  end if;

  v_input := jsonb_build_object(
    'include_games', true,
    'include_dlc', false,
    'include_software', false,
    'include_videos', false,
    'include_hardware', false,
    'max_results', least(greatest(coalesce(p_max_results, 1000), 1), 5000)
  );

  if coalesce(p_last_appid, 0) > 0 then
    v_input := v_input || jsonb_build_object('last_appid', p_last_appid);
  end if;

  if p_if_modified_since is not null and p_if_modified_since > 0 then
    v_input := v_input || jsonb_build_object('if_modified_since', p_if_modified_since);
  end if;

  v_url :=
    'https://api.steampowered.com/IStoreService/GetAppList/v1/?key='
    || extensions.urlencode(v_key::varchar)
    || '&input_json='
    || extensions.urlencode(v_input::text::varchar);

  select h.status, h.content
    into v_status, v_content
  from extensions.http_get(v_url) h;

  if v_status <> 200 then
    raise exception 'Steam GetAppList failed with HTTP status %', v_status;
  end if;

  begin
    v_payload := v_content::jsonb;
  exception when others then
    raise exception 'Steam GetAppList returned a non-JSON response';
  end;

  v_apps := coalesce(v_payload #> '{response,apps}', '[]'::jsonb);

  insert into public.steam_catalog_apps (
    steam_app_id,
    name,
    last_modified,
    price_change_number,
    last_seen_at,
    is_active
  )
  select
    (app ->> 'appid')::bigint,
    coalesce(nullif(app ->> 'name', ''), 'Steam App ' || (app ->> 'appid')),
    nullif(app ->> 'last_modified', '')::bigint,
    nullif(app ->> 'price_change_number', '')::bigint,
    now(),
    true
  from jsonb_array_elements(v_apps) app
  where nullif(app ->> 'appid', '') is not null
  on conflict (steam_app_id) do update set
    name = excluded.name,
    last_modified = excluded.last_modified,
    price_change_number = excluded.price_change_number,
    last_seen_at = now(),
    is_active = true,
    detail_synced_at = case
      when public.steam_catalog_apps.last_modified is distinct from excluded.last_modified
        or public.steam_catalog_apps.price_change_number is distinct from excluded.price_change_number
      then null
      else public.steam_catalog_apps.detail_synced_at
    end;

  v_count := jsonb_array_length(v_apps);

  if v_count > 0 then
    select (app ->> 'appid')::bigint
      into v_next_last_appid
    from jsonb_array_elements(v_apps) with ordinality t(app, ord)
    order by ord desc
    limit 1;
  end if;

  v_has_more := coalesce(
    (v_payload #>> '{response,have_more_results}')::boolean,
    v_count >= least(greatest(coalesce(p_max_results, 1000), 1), 5000)
  );

  update public.steam_discovery_state
  set
    last_appid = case when v_has_more then v_next_last_appid else 0 end,
    incremental_since = case
      when p_if_modified_since is not null and not v_has_more
        then extract(epoch from now())::bigint
      when p_if_modified_since is not null
        then p_if_modified_since
      else incremental_since
    end,
    last_discovery_at = now(),
    full_scan_completed_at = case
      when p_if_modified_since is null and not v_has_more then now()
      else full_scan_completed_at
    end,
    updated_at = now()
  where id = 'catalog';

  return jsonb_build_object(
    'discovered', v_count,
    'next_last_appid', v_next_last_appid,
    'has_more', v_has_more,
    'incremental', p_if_modified_since is not null,
    'max_results', least(greatest(coalesce(p_max_results, 1000), 1), 5000)
  );
end;
$$;

create or replace function public.run_steam_discovery_step()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_appid bigint;
  v_incremental_since bigint;
  v_completed_at timestamptz;
  v_last_discovery_at timestamptz;
  v_result jsonb;
  v_since bigint;
begin
  select
    last_appid,
    incremental_since,
    full_scan_completed_at,
    last_discovery_at
  into
    v_last_appid,
    v_incremental_since,
    v_completed_at,
    v_last_discovery_at
  from public.steam_discovery_state
  where id = 'catalog';

  if v_completed_at is null then
    select public.discover_steam_catalog_page(
      coalesce(v_last_appid, 0),
      5000,
      null
    ) into v_result;

    return v_result;
  end if;

  if coalesce(v_last_appid, 0) > 0 and v_incremental_since is not null then
    select public.discover_steam_catalog_page(
      v_last_appid,
      5000,
      v_incremental_since
    ) into v_result;

    return v_result;
  end if;

  if v_last_discovery_at is not null
     and v_last_discovery_at > now() - interval '24 hours' then
    return jsonb_build_object(
      'status', 'waiting_for_daily_incremental',
      'last_discovery_at', v_last_discovery_at
    );
  end if;

  v_since := coalesce(
    v_incremental_since,
    extract(epoch from v_completed_at)::bigint
  );

  update public.steam_discovery_state
  set incremental_since = v_since
  where id = 'catalog';

  select public.discover_steam_catalog_page(
    0,
    5000,
    v_since
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.discover_steam_catalog_page(bigint,integer,bigint)
from public, anon, authenticated;
grant execute on function public.discover_steam_catalog_page(bigint,integer,bigint)
to service_role;

revoke all on function public.run_steam_discovery_step()
from public, anon, authenticated;
grant execute on function public.run_steam_discovery_step()
to service_role;
