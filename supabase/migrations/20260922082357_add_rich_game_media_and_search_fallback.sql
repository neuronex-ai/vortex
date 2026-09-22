alter table public.games
  add column if not exists screenshots jsonb not null default '[]'::jsonb,
  add column if not exists movies jsonb not null default '[]'::jsonb,
  add column if not exists website text,
  add column if not exists support_info jsonb not null default '{}'::jsonb;

create table if not exists public.steam_search_cache (
  query_key text primary key,
  app_ids bigint[] not null default '{}',
  searched_at timestamptz not null default now()
);

alter table public.steam_search_cache enable row level security;
revoke all on table public.steam_search_cache from anon, authenticated;

create policy "clients cannot read steam search cache"
on public.steam_search_cache
for select
to anon, authenticated
using (false);

create policy "clients cannot write steam search cache"
on public.steam_search_cache
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.sync_steam_app(p_app_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  node jsonb;
  data jsonb;
  genres_arr text[] := '{}'::text[];
  genre_ids_arr integer[] := '{}'::integer[];
  categories_arr text[] := '{}'::text[];
  category_ids_arr integer[] := '{}'::integer[];
  developers_arr text[] := '{}'::text[];
  publishers_arr text[] := '{}'::text[];
  descriptors jsonb := '{}'::jsonb;
  adult_reason_value text;
  release_text text;
  release_date_value date;
  release_year_value smallint;
  recommendations_value bigint := 0;
  metacritic_value smallint;
  popularity_value numeric(12,4) := 0;
  header_value text;
  title_value text;
  slug_value text;
  local_coop_value boolean := false;
  split_screen_value boolean := false;
  response_status integer;
begin
  select h.status, h.content::jsonb
    into response_status, payload
  from extensions.http_get(
    'https://store.steampowered.com/api/appdetails?appids='
    || p_app_id::text
    || '&cc=BR&l=portuguese'
  ) as h;

  if response_status <> 200 then
    return jsonb_build_object('ok', false, 'app_id', p_app_id, 'status', response_status);
  end if;

  node := payload -> p_app_id::text;

  if node is null or coalesce((node ->> 'success')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'app_id', p_app_id, 'reason', 'Steam returned no public app data');
  end if;

  data := node -> 'data';

  if coalesce(data ->> 'type', '') <> 'game' then
    return jsonb_build_object('ok', false, 'app_id', p_app_id, 'reason', 'Not a game');
  end if;

  title_value := nullif(data ->> 'name', '');
  if title_value is null then
    return jsonb_build_object('ok', false, 'app_id', p_app_id, 'reason', 'Missing title');
  end if;

  select
    coalesce(array_agg(value ->> 'description' order by (value ->> 'id')::integer), '{}'::text[]),
    coalesce(array_agg((value ->> 'id')::integer order by (value ->> 'id')::integer), '{}'::integer[])
  into genres_arr, genre_ids_arr
  from jsonb_array_elements(coalesce(data -> 'genres', '[]'::jsonb)) value;

  select
    coalesce(array_agg(value ->> 'description' order by (value ->> 'id')::integer), '{}'::text[]),
    coalesce(array_agg((value ->> 'id')::integer order by (value ->> 'id')::integer), '{}'::integer[])
  into categories_arr, category_ids_arr
  from jsonb_array_elements(coalesce(data -> 'categories', '[]'::jsonb)) value;

  select coalesce(array_agg(value), '{}'::text[])
    into developers_arr
  from jsonb_array_elements_text(coalesce(data -> 'developers', '[]'::jsonb)) value;

  select coalesce(array_agg(value), '{}'::text[])
    into publishers_arr
  from jsonb_array_elements_text(coalesce(data -> 'publishers', '[]'::jsonb)) value;

  descriptors := coalesce(data -> 'content_descriptors', '{}'::jsonb);

  adult_reason_value := public.fusion_adult_content_reason(
    title_value,
    coalesce(data ->> 'short_description', '') || ' ' || coalesce(data ->> 'about_the_game', ''),
    genres_arr,
    descriptors
  );

  local_coop_value := 39 = any(category_ids_arr);
  split_screen_value := 24 = any(category_ids_arr) or 39 = any(category_ids_arr);

  release_text := coalesce(data #>> '{release_date,date}', '');
  release_year_value := nullif(substring(release_text from '[12][0-9]{3}'), '')::smallint;

  if release_year_value is not null then
    release_date_value := make_date(release_year_value, 1, 1);
  end if;

  recommendations_value := coalesce(nullif(data #>> '{recommendations,total}', '')::bigint, 0);
  metacritic_value := nullif(data #>> '{metacritic,score}', '')::smallint;

  popularity_value :=
      ln(1 + greatest(recommendations_value, 0)) * 10
      + coalesce(metacritic_value, 0) / 10.0
      + case
          when release_year_value >= extract(year from current_date)::int - 2 then 3
          when release_year_value >= extract(year from current_date)::int - 5 then 1
          else 0
        end;

  header_value := nullif(data ->> 'header_image', '');

  slug_value := lower(regexp_replace(
    regexp_replace(title_value, '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-|-$)', '', 'g'
  ));
  if slug_value = '' then
    slug_value := 'steam-' || p_app_id::text;
  end if;

  insert into public.games (
    steam_app_id, slug, title, app_type, short_description, about_game,
    header_image, capsule_image, background_image, release_date, release_year,
    is_free, required_age, adult_content, adult_reason, local_coop,
    shared_split_screen, controller_support, genres, steam_genre_ids,
    categories, steam_category_ids, tags, developers, publishers, platforms,
    pc_requirements, content_descriptors, metacritic_score, recommendations_total,
    price_currency, price_initial, price_final, discount_percent, popularity_score,
    search_text, steam_store_url, screenshots, movies, website, support_info,
    last_synced_at, is_visible
  )
  values (
    p_app_id, slug_value, title_value, coalesce(data ->> 'type', 'game'),
    data ->> 'short_description', data ->> 'about_the_game', header_value,
    data ->> 'capsule_image', data ->> 'background', release_date_value,
    release_year_value, coalesce((data ->> 'is_free')::boolean, false),
    coalesce(nullif(regexp_replace(coalesce(data ->> 'required_age','0'), '[^0-9]', '', 'g'), '')::integer, 0),
    adult_reason_value is not null, adult_reason_value, local_coop_value,
    split_screen_value, data ->> 'controller_support', genres_arr, genre_ids_arr,
    categories_arr, category_ids_arr, '{}'::text[], developers_arr, publishers_arr,
    coalesce(data -> 'platforms', '{}'::jsonb),
    coalesce(data -> 'pc_requirements', '{}'::jsonb), descriptors, metacritic_value,
    recommendations_value, data #>> '{price_overview,currency}',
    nullif(data #>> '{price_overview,initial}', '')::integer,
    nullif(data #>> '{price_overview,final}', '')::integer,
    nullif(data #>> '{price_overview,discount_percent}', '')::smallint,
    popularity_value,
    concat_ws(' ', title_value, data ->> 'short_description',
      array_to_string(genres_arr, ' '), array_to_string(categories_arr, ' '),
      array_to_string(developers_arr, ' '), array_to_string(publishers_arr, ' ')),
    'https://store.steampowered.com/app/' || p_app_id::text || '/',
    coalesce(data -> 'screenshots', '[]'::jsonb),
    coalesce(data -> 'movies', '[]'::jsonb),
    nullif(data ->> 'website', ''),
    coalesce(data -> 'support_info', '{}'::jsonb),
    now(), true
  )
  on conflict (steam_app_id) do update set
    slug = excluded.slug,
    title = excluded.title,
    app_type = excluded.app_type,
    short_description = excluded.short_description,
    about_game = excluded.about_game,
    header_image = excluded.header_image,
    capsule_image = excluded.capsule_image,
    background_image = excluded.background_image,
    release_date = excluded.release_date,
    release_year = excluded.release_year,
    is_free = excluded.is_free,
    required_age = excluded.required_age,
    adult_content = excluded.adult_content,
    adult_reason = excluded.adult_reason,
    local_coop = excluded.local_coop,
    shared_split_screen = excluded.shared_split_screen,
    controller_support = excluded.controller_support,
    genres = excluded.genres,
    steam_genre_ids = excluded.steam_genre_ids,
    categories = excluded.categories,
    steam_category_ids = excluded.steam_category_ids,
    developers = excluded.developers,
    publishers = excluded.publishers,
    platforms = excluded.platforms,
    pc_requirements = excluded.pc_requirements,
    content_descriptors = excluded.content_descriptors,
    metacritic_score = excluded.metacritic_score,
    recommendations_total = excluded.recommendations_total,
    price_currency = excluded.price_currency,
    price_initial = excluded.price_initial,
    price_final = excluded.price_final,
    discount_percent = excluded.discount_percent,
    popularity_score = excluded.popularity_score,
    search_text = excluded.search_text,
    steam_store_url = excluded.steam_store_url,
    screenshots = excluded.screenshots,
    movies = excluded.movies,
    website = excluded.website,
    support_info = excluded.support_info,
    last_synced_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'app_id', p_app_id,
    'title', title_value,
    'adult_content', adult_reason_value is not null,
    'local_coop', local_coop_value,
    'release_year', release_year_value
  );
end;
$$;

revoke all on function public.sync_steam_app(bigint)
from public, anon, authenticated;
grant execute on function public.sync_steam_app(bigint) to service_role;

create or replace function public.search_steam_fallback_ids(
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
  v_app_id bigint;
begin
  v_query := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 8);

  if char_length(v_query) < 2 or char_length(v_query) > 80 then
    return '{}'::bigint[];
  end if;

  select app_ids into v_cached
  from public.steam_search_cache
  where query_key = v_query
    and searched_at > now() - interval '30 minutes';

  if v_cached is not null then
    return v_cached;
  end if;

  select h.status, h.content::jsonb
    into v_status, v_payload
  from extensions.http_get(
    'https://store.steampowered.com/api/storesearch/?term='
    || extensions.urlencode(v_query::varchar)
    || '&l=portuguese&cc=BR'
  ) h;

  if v_status <> 200 then
    return '{}'::bigint[];
  end if;

  select coalesce(array_agg(app_id order by ord), '{}'::bigint[])
    into v_ids
  from (
    select (item ->> 'id')::bigint as app_id, ord
    from jsonb_array_elements(coalesce(v_payload -> 'items', '[]'::jsonb))
      with ordinality t(item, ord)
    where item ->> 'type' = 'app'
      and nullif(item ->> 'id', '') is not null
    order by ord
    limit v_limit
  ) candidates;

  foreach v_app_id in array v_ids loop
    perform public.sync_steam_app(v_app_id);
  end loop;

  insert into public.steam_search_cache(query_key, app_ids, searched_at)
  values (v_query, v_ids, now())
  on conflict (query_key) do update set app_ids = excluded.app_ids, searched_at = now();

  return v_ids;
end;
$$;

revoke all on function public.search_steam_fallback_ids(text,integer) from public;
grant execute on function public.search_steam_fallback_ids(text,integer) to anon, authenticated;

create or replace function public.ensure_steam_game(p_app_id bigint)
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

revoke all on function public.ensure_steam_game(bigint) from public;
grant execute on function public.ensure_steam_game(bigint) to anon, authenticated;
