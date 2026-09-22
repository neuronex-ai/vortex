alter table public.games
  add column if not exists steam_category_ids integer[] not null default '{}',
  add column if not exists steam_genre_ids integer[] not null default '{}';

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
    search_text, steam_store_url, last_synced_at, is_visible
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

revoke all on function public.sync_steam_app(bigint) from public, anon, authenticated;
