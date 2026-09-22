drop function if exists public.search_games(text,text,text,numeric,date,text,bigint,integer);

create function public.search_games(
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
  about_game text,
  header_image text,
  release_date date,
  release_year smallint,
  is_free boolean,
  required_age integer,
  local_coop boolean,
  shared_split_screen boolean,
  controller_support text,
  genres text[],
  categories text[],
  tags text[],
  developers text[],
  publishers text[],
  platforms jsonb,
  pc_requirements jsonb,
  metacritic_score smallint,
  recommendations_total bigint,
  price_currency text,
  price_initial integer,
  price_final integer,
  discount_percent smallint,
  popularity_score numeric,
  steam_store_url text,
  cursor_score numeric,
  cursor_date date,
  cursor_title text,
  cursor_id bigint,
  has_more boolean
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
        or g.search_vector @@ plainto_tsquery('simple'::regconfig, p.f)
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
  ),
  ordered as (
    select g.*
    from filtered g
    cross join params p
    order by
      case when p.s = 'popular' then g.popularity_score end desc nulls last,
      case when p.s = 'popular' then g.id end desc,
      case when p.s = 'recentes' then g.release_date end desc nulls last,
      case when p.s = 'recentes' then g.id end desc,
      case when p.s = 'nome' then lower(g.title) end asc nulls last,
      case when p.s = 'nome' then g.id end asc
    limit (select lim + 1 from params)
  ),
  page_rows as (
    select g.*, row_number() over () as page_row
    from ordered g
  )
  select
    g.id, g.steam_app_id, g.slug, g.title, g.short_description, g.about_game,
    g.header_image, g.release_date, g.release_year, g.is_free, g.required_age,
    g.local_coop, g.shared_split_screen, g.controller_support, g.genres,
    g.categories, g.tags, g.developers, g.publishers, g.platforms,
    g.pc_requirements, g.metacritic_score, g.recommendations_total,
    g.price_currency, g.price_initial, g.price_final, g.discount_percent,
    g.popularity_score, g.steam_store_url,
    g.popularity_score as cursor_score,
    g.release_date as cursor_date,
    g.title as cursor_title,
    g.id as cursor_id,
    (select count(*) > (select lim from params) from page_rows) as has_more
  from page_rows g
  cross join params p
  where g.page_row <= p.lim
  order by g.page_row;
$$;

revoke all on function public.search_games(text,text,text,numeric,date,text,bigint,integer) from public;
grant execute on function public.search_games(text,text,text,numeric,date,text,bigint,integer) to anon, authenticated;
