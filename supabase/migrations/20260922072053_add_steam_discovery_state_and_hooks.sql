create table public.steam_discovery_state (
  id text primary key default 'catalog' check (id = 'catalog'),
  last_appid bigint not null default 0,
  incremental_since bigint,
  full_scan_completed_at timestamptz,
  last_discovery_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.steam_discovery_state(id)
values ('catalog')
on conflict (id) do nothing;

alter table public.steam_discovery_state enable row level security;
revoke all on table public.steam_discovery_state from anon, authenticated;

create policy "clients cannot read steam discovery state"
on public.steam_discovery_state
for select
to anon, authenticated
using (false);

create policy "clients cannot write steam discovery state"
on public.steam_discovery_state
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.after_game_catalog_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.steam_catalog_apps
  set
    detail_synced_at = now(),
    sync_attempts = sync_attempts + 1,
    last_sync_error = null,
    last_seen_at = now()
  where steam_app_id = new.steam_app_id;

  perform public.sync_official_steam_distribution_source(new.id);
  return new;
end;
$$;

drop trigger if exists games_after_catalog_sync on public.games;
create trigger games_after_catalog_sync
after insert or update of
  title,
  short_description,
  header_image,
  steam_store_url,
  last_synced_at
on public.games
for each row
execute function public.after_game_catalog_sync();

create or replace function public.mark_steam_sync_failure(
  p_app_id bigint,
  p_error text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.steam_catalog_apps
  set
    sync_attempts = sync_attempts + 1,
    last_sync_error = left(coalesce(p_error, 'Unknown error'), 1000),
    last_seen_at = now()
  where steam_app_id = p_app_id;
$$;

revoke all on function public.mark_steam_sync_failure(bigint,text) from public, anon, authenticated;
grant execute on function public.mark_steam_sync_failure(bigint,text) to service_role;
