create table public.steam_catalog_apps (
  steam_app_id bigint primary key check (steam_app_id > 0),
  name text not null,
  last_modified bigint,
  price_change_number bigint,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  detail_synced_at timestamptz,
  sync_attempts integer not null default 0,
  last_sync_error text,
  is_active boolean not null default true
);

create index steam_catalog_apps_pending_idx
  on public.steam_catalog_apps (detail_synced_at nulls first, steam_app_id)
  where is_active = true;

alter table public.steam_catalog_apps enable row level security;
revoke all on table public.steam_catalog_apps from anon, authenticated;

create policy "clients cannot read steam discovery queue"
on public.steam_catalog_apps
for select
to anon, authenticated
using (false);

create policy "clients cannot write steam discovery queue"
on public.steam_catalog_apps
for all
to anon, authenticated
using (false)
with check (false);

create table public.game_distribution_sources (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  provider_key text not null,
  provider_name text not null,
  source_kind text not null check (
    source_kind in (
      'official_store',
      'official_demo',
      'freeware',
      'open_source_release',
      'authorized_download',
      'publisher_download'
    )
  ),
  landing_url text,
  download_url text,
  platform text[] not null default '{windows}',
  version_label text,
  availability text not null default 'available' check (
    availability in ('available','unavailable','unknown')
  ),
  is_authorized boolean not null default false,
  is_direct_download boolean not null default false,
  is_visible boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (landing_url is not null or download_url is not null)
);

create unique index game_distribution_sources_identity_idx
  on public.game_distribution_sources (
    game_id,
    provider_key,
    coalesce(download_url, landing_url)
  );

create index game_distribution_sources_public_idx
  on public.game_distribution_sources (game_id, provider_key)
  where is_authorized = true and is_visible = true and availability = 'available';

alter table public.game_distribution_sources enable row level security;

revoke all on table public.game_distribution_sources from anon, authenticated;
grant select on table public.game_distribution_sources to anon, authenticated;

create policy "authorized distribution sources are public"
on public.game_distribution_sources
for select
to anon, authenticated
using (
  is_visible = true
  and is_authorized = true
  and availability = 'available'
);

create or replace function public.get_steam_web_api_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_steam_web_api_key() from public, anon, authenticated;
grant execute on function public.get_steam_web_api_key() to service_role;

create or replace function public.pending_steam_app_ids(p_limit integer default 50)
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(steam_app_id order by steam_app_id), '{}'::bigint[])
  from (
    select steam_app_id
    from public.steam_catalog_apps
    where is_active = true
      and (
        detail_synced_at is null
        or detail_synced_at < now() - interval '30 days'
      )
    order by detail_synced_at nulls first, steam_app_id
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  ) pending;
$$;

revoke all on function public.pending_steam_app_ids(integer) from public, anon, authenticated;
grant execute on function public.pending_steam_app_ids(integer) to service_role;

create or replace function public.sync_official_steam_distribution_source(p_game_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select steam_store_url into v_url
  from public.games
  where id = p_game_id;

  if v_url is null then
    return;
  end if;

  insert into public.game_distribution_sources (
    game_id,
    provider_key,
    provider_name,
    source_kind,
    landing_url,
    platform,
    availability,
    is_authorized,
    is_direct_download,
    is_visible,
    last_checked_at
  )
  values (
    p_game_id,
    'steam',
    'Steam',
    'official_store',
    v_url,
    array['windows']::text[],
    'available',
    true,
    false,
    true,
    now()
  )
  on conflict (game_id, provider_key, coalesce(download_url, landing_url))
  do update set
    landing_url = excluded.landing_url,
    availability = 'available',
    is_authorized = true,
    is_visible = true,
    last_checked_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.sync_official_steam_distribution_source(bigint) from public, anon, authenticated;
grant execute on function public.sync_official_steam_distribution_source(bigint) to service_role;

insert into public.game_distribution_sources (
  game_id,
  provider_key,
  provider_name,
  source_kind,
  landing_url,
  platform,
  availability,
  is_authorized,
  is_direct_download,
  is_visible,
  last_checked_at
)
select
  g.id,
  'steam',
  'Steam',
  'official_store',
  g.steam_store_url,
  array['windows']::text[],
  'available',
  true,
  false,
  true,
  now()
from public.games g
where g.steam_store_url is not null
on conflict (game_id, provider_key, coalesce(download_url, landing_url))
do nothing;
