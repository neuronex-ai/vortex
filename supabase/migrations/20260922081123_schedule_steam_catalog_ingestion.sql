create extension if not exists pg_cron;

create or replace function public.run_steam_discovery_step()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_appid bigint;
  v_completed_at timestamptz;
  v_result jsonb;
begin
  select last_appid, full_scan_completed_at
    into v_last_appid, v_completed_at
  from public.steam_discovery_state
  where id = 'catalog';

  if v_completed_at is not null and coalesce(v_last_appid, 0) = 0 then
    return jsonb_build_object(
      'status', 'full_scan_complete',
      'completed_at', v_completed_at
    );
  end if;

  select public.discover_steam_catalog_page(
    coalesce(v_last_appid, 0),
    5000,
    null
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.run_steam_discovery_step()
from public, anon, authenticated;
grant execute on function public.run_steam_discovery_step() to service_role;

create or replace function public.run_steam_detail_sync_step(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  v_ids := public.pending_steam_app_ids(
    least(greatest(coalesce(p_limit, 20), 1), 20)
  );

  if coalesce(cardinality(v_ids), 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'status', 'nothing_pending',
      'requested', 0
    );
  end if;

  return public.sync_steam_apps(v_ids);
end;
$$;

revoke all on function public.run_steam_detail_sync_step(integer)
from public, anon, authenticated;
grant execute on function public.run_steam_detail_sync_step(integer) to service_role;

select cron.schedule(
  'fusion-steam-discovery',
  '*/10 * * * *',
  $$select public.run_steam_discovery_step();$$
);

select cron.schedule(
  'fusion-steam-details',
  '*/5 * * * *',
  $$select public.run_steam_detail_sync_step(20);$$
);

select cron.schedule(
  'fusion-cron-history-cleanup',
  '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$
);
