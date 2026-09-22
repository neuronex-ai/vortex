import { supabase } from "../lib/supabase.js";

export const PAGE_SIZE = 20;

const gameFields = [
  "id",
  "steam_app_id",
  "slug",
  "title",
  "short_description",
  "about_game",
  "header_image",
  "capsule_image",
  "background_image",
  "screenshots",
  "movies",
  "website",
  "support_info",
  "release_date",
  "release_year",
  "is_free",
  "required_age",
  "local_coop",
  "shared_split_screen",
  "controller_support",
  "genres",
  "categories",
  "tags",
  "developers",
  "publishers",
  "platforms",
  "pc_requirements",
  "metacritic_score",
  "recommendations_total",
  "price_currency",
  "price_initial",
  "price_final",
  "discount_percent",
  "popularity_score",
  "steam_store_url",
].join(",");

function textOnly(value = "") {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueImages(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function formatPrice(row) {
  if (row.is_free) return "Grátis";
  if (row.price_final == null || !row.price_currency) return "Ver na Steam";

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: row.price_currency,
    }).format(row.price_final / 100);
  } catch {
    return "Ver preço";
  }
}

function playerLabel(row) {
  if (row.local_coop) return "Coop local";

  const categories = row.categories ?? [];
  if (categories.some((item) => /co-op/i.test(item))) return "Co-op online";
  if (categories.some((item) => /multijogador|multi-player/i.test(item))) {
    return "Multijogador";
  }

  return "Um jogador";
}

export function mapGameRow(row) {
  const screenshots = Array.isArray(row.screenshots)
    ? row.screenshots
        .map((shot) => ({
          full: shot?.path_full || shot?.full || null,
          thumbnail: shot?.path_thumbnail || shot?.thumbnail || shot?.path_full || null,
        }))
        .filter((shot) => shot.full)
    : [];

  const gallery = uniqueImages([
    row.header_image,
    row.background_image,
    ...screenshots.map((shot) => shot.full),
  ]);

  return {
    id: row.id,
    steamAppId: row.steam_app_id,
    slug: row.slug,
    title: row.title,
    description: row.short_description || "Descrição não disponível.",
    about: textOnly(row.about_game || row.short_description || ""),
    image: row.header_image,
    capsuleImage: row.capsule_image,
    backgroundImage: row.background_image,
    screenshots,
    gallery,
    movies: Array.isArray(row.movies) ? row.movies : [],
    website: row.website,
    support: row.support_info ?? {},
    year: row.release_year,
    releaseDate: row.release_date,
    isFree: row.is_free,
    requiredAge: row.required_age,
    localCoop: row.local_coop,
    splitScreen: row.shared_split_screen,
    controllerSupport: row.controller_support,
    genres: row.genres ?? [],
    categories: row.categories ?? [],
    tags: (row.tags?.length ? row.tags : row.categories ?? []).slice(0, 12),
    developers: row.developers ?? [],
    publishers: row.publishers ?? [],
    platforms: row.platforms ?? {},
    metacritic: row.metacritic_score,
    recommendations: row.recommendations_total ?? 0,
    price: formatPrice(row),
    players: playerLabel(row),
    storeUrl: row.steam_store_url,
    requirements: {
      minimum: textOnly(row.pc_requirements?.minimum || ""),
      recommended: textOnly(row.pc_requirements?.recommended || ""),
    },
    cursor: {
      score: row.cursor_score ?? row.popularity_score ?? null,
      date: row.cursor_date ?? row.release_date ?? null,
      title: row.cursor_title ?? row.title ?? null,
      id: row.cursor_id ?? row.id,
    },
    hasMore: Boolean(row.has_more),
  };
}

async function fetchSteamFallbackGames(query, limit = 8) {
  const { data: appIds, error: fallbackError } = await supabase.rpc(
    "search_steam_fallback_ids",
    {
      p_query: query,
      p_limit: Math.min(Math.max(limit, 1), 8),
    },
  );

  if (fallbackError || !Array.isArray(appIds) || !appIds.length) return [];

  const { data, error } = await supabase
    .from("games")
    .select(gameFields)
    .in("steam_app_id", appIds);

  if (error) throw error;

  const byAppId = new Map((data ?? []).map((row) => [Number(row.steam_app_id), row]));
  return appIds
    .map((appId) => byAppId.get(Number(appId)))
    .filter(Boolean)
    .map(mapGameRow);
}

export async function fetchGamePage({
  query = "",
  filter = "Todos",
  sort = "popular",
  cursor = null,
  limit = PAGE_SIZE,
} = {}) {
  const { data, error } = await supabase.rpc("search_games", {
    p_query: query || null,
    p_filter: filter || "Todos",
    p_sort: sort,
    p_cursor_score: cursor?.score ?? null,
    p_cursor_date: cursor?.date ?? null,
    p_cursor_title: cursor?.title ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: Math.min(limit, PAGE_SIZE),
  });

  if (error) throw error;

  const localGames = (data ?? []).map(mapGameRow);
  let games = localGames;
  let steamFallbackCount = 0;

  if (!cursor && query.trim().length >= 2 && localGames.length < 5) {
    const fallback = await fetchSteamFallbackGames(query, 8);
    const knownIds = new Set(localGames.map((game) => game.steamAppId));
    const additions = fallback.filter((game) => !knownIds.has(game.steamAppId));

    steamFallbackCount = additions.length;
    games = [...localGames, ...additions].slice(0, PAGE_SIZE);
  }

  return {
    games,
    hasMore: localGames[0]?.hasMore ?? false,
    nextCursor: localGames.at(-1)?.cursor ?? null,
    steamFallbackCount,
  };
}

export async function fetchGameBySlug(slug) {
  const { data, error } = await supabase
    .from("games")
    .select(gameFields)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data ? mapGameRow(data) : null;
}

export async function hydrateGameDetails(game) {
  if (!game?.steamAppId) return game;

  const { data: gameId, error: ensureError } = await supabase.rpc(
    "ensure_steam_game",
    { p_app_id: game.steamAppId },
  );

  if (ensureError || !gameId) return game;

  const { data, error } = await supabase
    .from("games")
    .select(gameFields)
    .eq("id", gameId)
    .maybeSingle();

  if (error || !data) return game;
  return mapGameRow(data);
}

export async function fetchFeaturedCoop() {
  const result = await fetchGamePage({
    filter: "Coop local",
    sort: "popular",
    limit: 4,
  });

  return result.games;
}

export async function fetchDistributionSources(gameId) {
  const { data, error } = await supabase
    .from("game_distribution_sources")
    .select(
      "id,provider_key,provider_name,source_kind,landing_url,download_url,platform,version_label,is_direct_download,last_checked_at",
    )
    .eq("game_id", gameId)
    .order("provider_name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((source) => ({
    id: source.id,
    providerKey: source.provider_key,
    providerName: source.provider_name,
    kind: source.source_kind,
    landingUrl: source.landing_url,
    downloadUrl: source.download_url,
    platforms: source.platform ?? [],
    version: source.version_label,
    direct: source.is_direct_download,
    lastCheckedAt: source.last_checked_at,
  }));
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function fetchFavoritePage({ page = 1, limit = PAGE_SIZE } = {}) {
  const user = await currentUser();
  if (!user) return { games: [], count: 0, page: 1, pageSize: limit };

  const safeLimit = Math.min(Math.max(limit, 1), PAGE_SIZE);
  const safePage = Math.max(page, 1);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, error, count } = await supabase
    .from("game_favorites")
    .select(`game_id,created_at,games(${gameFields})`, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    games: (data ?? [])
      .map((favorite) => favorite.games)
      .filter(Boolean)
      .map(mapGameRow),
    count: count ?? 0,
    page: safePage,
    pageSize: safeLimit,
  };
}

export async function fetchFavoriteGames(limit = 8) {
  const result = await fetchFavoritePage({ page: 1, limit });
  return result.games;
}

export async function addFavorite(gameId) {
  const user = await currentUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { error } = await supabase
    .from("game_favorites")
    .insert({ user_id: user.id, game_id: gameId });

  if (error && error.code !== "23505") throw error;
}

export async function removeFavorite(gameId) {
  const user = await currentUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { error } = await supabase
    .from("game_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("game_id", gameId);

  if (error) throw error;
}
