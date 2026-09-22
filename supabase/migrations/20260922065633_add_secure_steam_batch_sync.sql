grant execute on function public.sync_steam_app(bigint) to service_role;

create or replace function public.sync_steam_apps(p_app_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_app_id bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_synced integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_requested integer := coalesce(cardinality(p_app_ids), 0);
begin
  if v_requested = 0 then
    return jsonb_build_object('ok', true, 'requested', 0, 'synced', 0, 'skipped', 0, 'failed', 0, 'results', '[]'::jsonb);
  end if;

  if v_requested > 50 then
    raise exception 'A maximum of 50 Steam App IDs can be synchronized per batch';
  end if;

  insert into public.game_sync_runs(source, status, requested_count)
  values ('steam_store', 'running', v_requested)
  returning id into v_run_id;

  foreach v_app_id in array p_app_ids
  loop
    begin
      v_result := public.sync_steam_app(v_app_id);
      v_results := v_results || jsonb_build_array(v_result);

      if coalesce((v_result ->> 'ok')::boolean, false) then
        v_synced := v_synced + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('ok', false, 'app_id', v_app_id, 'reason', sqlerrm)
      );
    end;
  end loop;

  update public.game_sync_runs
  set
    status = case
      when v_failed = 0 and v_skipped = 0 then 'success'
      when v_synced > 0 then 'partial'
      else 'failed'
    end,
    synced_count = v_synced,
    skipped_count = v_skipped,
    failed_count = v_failed,
    finished_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'run_id', v_run_id,
    'requested', v_requested,
    'synced', v_synced,
    'skipped', v_skipped,
    'failed', v_failed,
    'results', v_results
  );
end;
$$;

revoke all on function public.sync_steam_apps(bigint[]) from public, anon, authenticated;
grant execute on function public.sync_steam_apps(bigint[]) to service_role;
