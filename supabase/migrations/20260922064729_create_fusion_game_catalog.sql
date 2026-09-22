create extension if not exists pg_trgm with schema extensions;

create table public.games (
  id bigint generated always as identity primary key,
  steam_app_id bigint not null unique check (steam_app_id > 0),
  slug text not null unique,
  title text not null,
  app_type text not null default 'game',
  short_description text,
  about_game text,
  header_image text,
  capsule_image text,
  background_image text,
  release_date date,
  release_year smallint check (release_year is null or release_year between 1970 and 2200),
  is_free boolean not null default false,
  required_age integer not null default 0 check (required_age >= 0),
  adult_content boolean not null default false,
  adult_reason text,
  local_coop boolean not null default false,
  shared_split_screen boolean not null default false,
  controller_support text,
  genres text[] not null default '{}',
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  developers text[] not null default '{}',
  publishers text[] not null default '{}',
  platforms jsonb not null default '{}'::jsonb,
  pc_requirements jsonb not null default '{}'::jsonb,
  metacritic_score smallint check (metacritic_score is null or metacritic_score between 0 and 100),
  recommendations_total bigint not null default 0 check (recommendations_total >= 0),
  price_currency text,
  price_initial integer check (price_initial is null or price_initial >= 0),
  price_final integer check (price_final is null or price_final >= 0),
  discount_percent smallint check (discount_percent is null or discount_percent between 0 and 100),
  popularity_score numeric(12,4) not null default 0,
  search_text text not null default '',
  search_vector tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(search_text, ''))
  ) stored,
  source_modified_at timestamptz,
  last_synced_at timestamptz not null default now(),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_sync_runs (
  id bigint generated always as identity primary key,
  source text not null default 'steam',
  status text not null check (status in ('running','success','partial','failed')),
  requested_count integer not null default 0,
  synced_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  cursor_value text,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index games_visible_popular_idx
  on public.games (adult_content, is_visible, popularity_score desc, id desc);

create index games_visible_recent_idx
  on public.games (adult_content, is_visible, release_date desc, id desc);

create index games_visible_title_idx
  on public.games (adult_content, is_visible, lower(title), id);

create index games_local_coop_idx
  on public.games (local_coop, popularity_score desc, id desc)
  where adult_content = false and is_visible = true;

create index games_search_vector_idx
  on public.games using gin (search_vector);

create index games_title_trgm_idx
  on public.games using gin (title extensions.gin_trgm_ops);

create or replace function public.games_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_set_updated_at
before update on public.games
for each row execute function public.games_set_updated_at();

alter table public.games enable row level security;
alter table public.game_sync_runs enable row level security;

revoke all on table public.games from anon, authenticated;
revoke all on table public.game_sync_runs from anon, authenticated;
grant select on table public.games to anon, authenticated;

create policy "safe catalog is publicly readable"
on public.games
for select
to anon, authenticated
using (is_visible = true and adult_content = false);

create or replace function public.search_games(
  p_query text default null,
  p_filter text default null,
  p_sort text default 'popular',
  p_cursor_score numeric default null,
  p_cursor_date date default null,
  p_cursor_title text default null,
  p_cursor_id bigint default null,
  p_limit integer default 20
)
returns table (
  id bigint,
  steam_app_id bigint,
  slug text,
  title text,
  short_description text,
  header_image text,
  release_date date,
  release_year smallint,
  is_free boolean,
  local_coop boolean,
  shared_split_screen boolean,
  controller_support text,
  genres text[],
  categories text[],
  tags text[],
  developers text[],
  publishers text[],
  platforms jsonb,
  metacritic_score smallint,
  recommendations_total bigint,
  price_currency text,
  price_initial integer,
  price_final integer,
  discount_percent smallint,
  popularity_score numeric,
  cursor_score numeric,
  cursor_date date,
  cursor_title text,
  cursor_id bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(p_query), '') as q,
      coalesce(nullif(btrim(p_filter), ''), 'Todos') as f,
      case when p_sort in ('popular', 'recentes', 'nome') then p_sort else 'popular' end as s,
      least(greatest(coalesce(p_limit, 20), 1), 20) as lim
  ),
  filtered as (
    select g.*
    from public.games g
    cross join params p
    where g.is_visible = true
      and g.adult_content = false
      and (
        p.q is null
        or g.search_vector @@ websearch_to_tsquery('simple'::regconfig, p.q)
        or g.title OPERATOR(extensions.%) p.q
      )
      and (
        p.f = 'Todos'
        or (p.f = 'Coop local' and g.local_coop = true)
        or exists (
          select 1
          from unnest(g.genres || g.categories || g.tags) item
          where lower(item) = lower(p.f)
        )
      )
      and (
        p_cursor_id is null
        or (
          p.s = 'popular'
          and (g.popularity_score, g.id) < (coalesce(p_cursor_score, 0), p_cursor_id)
        )
        or (
          p.s = 'recentes'
          and (coalesce(g.release_date, date '1900-01-01'), g.id)
              < (coalesce(p_cursor_date, date '1900-01-01'), p_cursor_id)
        )
        or (
          p.s = 'nome'
          and (lower(g.title), g.id)
              > (lower(coalesce(p_cursor_title, '')), p_cursor_id)
        )
      )
  )
  select
    g.id,
    g.steam_app_id,
    g.slug,
    g.title,
    g.short_description,
    g.header_image,
    g.release_date,
    g.release_year,
    g.is_free,
    g.local_coop,
    g.shared_split_screen,
    g.controller_support,
    g.genres,
    g.categories,
    g.tags,
    g.developers,
    g.publishers,
    g.platforms,
    g.metacritic_score,
    g.recommendations_total,
    g.price_currency,
    g.price_initial,
    g.price_final,
    g.discount_percent,
    g.popularity_score,
    g.popularity_score as cursor_score,
    g.release_date as cursor_date,
    g.title as cursor_title,
    g.id as cursor_id
  from filtered g
  cross join params p
  order by
    case when p.s = 'popular' then g.popularity_score end desc nulls last,
    case when p.s = 'popular' then g.id end desc,
    case when p.s = 'recentes' then g.release_date end desc nulls last,
    case when p.s = 'recentes' then g.id end desc,
    case when p.s = 'nome' then lower(g.title) end asc nulls last,
    case when p.s = 'nome' then g.id end asc
  limit (select lim from params);
$$;

revoke all on function public.search_games(text,text,text,numeric,date,text,bigint,integer) from public;
grant execute on function public.search_games(text,text,text,numeric,date,text,bigint,integer) to anon, authenticated;
