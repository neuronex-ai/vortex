import { supabase } from "../lib/supabase.js";
import { mergeSources, sourcesForGame } from "./catalogModel.mjs";

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
  "adult_content",
  "content_descriptors",
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
  if (categories.some((item) => /multijogador|multi-player/i.test(item))) return "Multijogador";
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
    steamAppId: Number(row.steam_app_id),
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
    storeUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
    requirements: {
      minimum: textOnly(row.pc_requirements?.minimum || ""),
      recommended: textOnly(row.pc_requirements?.recommended || ""),
    },
  };
}

const knownGames = new Map();

function rememberRows(rows = []) {
  return rows.map(mapGameRow).map((game) => {
    knownGames.set(game.steamAppId, game);
    return game;
  });
}

function safeOffset(cursor) {
  return Math.max(0, Math.floor(Number(cursor?.offset) || 0));
}

async function browseCatalog(options = {}) {
  const query = options.query?.trim() ?? "";
  const filter = options.filter || "Todos";
  const sort = options.sort || "popular";
  const limit = Math.min(Math.max(Number(options.limit) || PAGE_SIZE, 1), PAGE_SIZE);
  const offset = safeOffset(options.cursor);

  const { data, error } = await supabase.rpc("browse_fusion_catalog", {
    p_query: query,
    p_filter: filter,
    p_sort: sort,
    p_offset: offset,
    p_limit: Math.min(limit + 1, PAGE_SIZE + 1),
  });

  if (error) throw error;

  const mapped = rememberRows(data ?? []);
  const games = mapped.slice(0, limit).map((game, index) => ({
    ...game,
    cursor: { offset: offset + index + 1 },
  }));

  return {
    games,
    hasMore: mapped.length > limit,
    nextCursor: games.at(-1)?.cursor ?? null,
    metadataUnavailable: false,
  };
}

const steamSearchCache = new Map();

async function syncSteamSearch(query) {
  const key = query.toLowerCase().trim();
  const cached = steamSearchCache.get(key);
  if (cached && Date.now() - cached.time < 60_000) return cached.ids;

  const promise = supabase
    .rpc("search_steam_fallback_ids", {
      p_query: query,
      p_limit: 8,
    })
    .then(({ data, error }) => {
      if (error) throw error;
      return Array.isArray(data) ? data.map(Number).filter(Number.isSafeInteger) : [];
    });

  steamSearchCache.set(key, { time: Date.now(), ids: promise });
  if (steamSearchCache.size > 30) steamSearchCache.delete(steamSearchCache.keys().next().value);

  try {
    return await promise;
  } catch (error) {
    steamSearchCache.delete(key);
    throw error;
  }
}

export async function fetchGamePage(options = {}) {
  const query = options.query?.trim() ?? "";
  let steamSearchUnavailable = false;
  let page = await browseCatalog(options);

  if (query.length >= 2 && query.length <= 80 && page.games.length < 5) {
    try {
      const syncedIds = await syncSteamSearch(query);
      if (syncedIds.length) page = await browseCatalog(options);
    } catch {
      steamSearchUnavailable = true;
    }
  }

  return { ...page, steamSearchUnavailable };
}

export async function fetchGameBySlug(slug) {
  const { data, error } = await supabase
    .from("fusion_public_games")
    .select(gameFields)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rememberRows([data])[0] ?? null;
}

export async function hydrateGameDetails(game) {
  if (!game?.steamAppId) return game;

  try {
    const { error } = await supabase.rpc("ensure_steam_game", {
      p_app_id: Number(game.steamAppId),
    });
    if (error) throw error;

    const { data, error: readError } = await supabase
      .from("fusion_public_games")
      .select(gameFields)
      .eq("steam_app_id", Number(game.steamAppId))
      .maybeSingle();

    if (readError || !data) return knownGames.get(Number(game.steamAppId)) ?? game;
    return rememberRows([data])[0] ?? game;
  } catch {
    return knownGames.get(Number(game.steamAppId)) ?? game;
  }
}

export async function fetchFeaturedCoop() {
  return (await browseCatalog({ filter: "Coop local", sort: "popular", limit: 4 })).games;
}

let sourceInputsPromise;
function loadSourceInputs() {
  if (!sourceInputsPromise) {
    sourceInputsPromise = Promise.all([
      import("../../data/steam-sources.json"),
      import("../../data/steam-external-references.json"),
    ]).then(([local, references]) => ({
      local: local.default,
      references: references.default,
    }));
  }
  return sourceInputsPromise;
}

async function staticSourcesFor(appId, title) {
  try {
    const { local, references } = await loadSourceInputs();
    return sourcesForGame(appId, local, references, title);
  } catch {
    return [];
  }
}

async function readSourceCache(appId) {
  const { data, error } = await supabase
    .from("game_source_cache")
    .select("steam_app_id,sources,checked_at,next_check_at")
    .eq("steam_app_id", appId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function resolveSourceCache(appId) {
  if (!supabase.functions?.invoke) return [];
  const { data, error } = await supabase.functions.invoke("resolve-game-sources", {
    body: { appIds: [appId] },
  });
  if (error) throw error;
  const result = data?.results?.find((item) => Number(item?.appId) === appId);
  return Array.isArray(result?.sources) ? result.sources : [];
}

export async function fetchDistributionSources(appId) {
  const numericAppId = Number(appId);
  if (!Number.isSafeInteger(numericAppId) || numericAppId <= 0) return [];

  let game = knownGames.get(numericAppId);
  if (!game) {
    const { data } = await supabase
      .from("fusion_public_games")
      .select("id,steam_app_id,slug,title")
      .eq("steam_app_id", numericAppId)
      .maybeSingle();
    if (data) {
      game = {
        id: data.id,
        steamAppId: Number(data.steam_app_id),
        slug: data.slug,
        title: data.title,
      };
      knownGames.set(numericAppId, game);
    }
  }

  const staticSources = await staticSourcesFor(numericAppId, game?.title ?? "");

  let cache = null;
  try {
    cache = await readSourceCache(numericAppId);
  } catch {
    // Existing static references remain usable if the source cache is temporarily unavailable.
  }

  const cachedSources = (cache?.sources ?? []).map((source) => ({
    ...source,
    lastCheckedAt: source.lastCheckedAt ?? cache?.checked_at ?? null,
  }));

  const nextCheck = Date.parse(cache?.next_check_at ?? "");
  const stale = !cache || !Number.isFinite(nextCheck) || nextCheck <= Date.now();
  let resolvedSources = [];

  if (stale) {
    try {
      resolvedSources = await resolveSourceCache(numericAppId);
    } catch {
      // Do not remove already-known links when source revalidation cannot run.
    }
  }

  return mergeSources(staticSources, cachedSources, resolvedSources);
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

  const { data: favorites, error, count } = await supabase
    .from("game_favorites")
    .select("game_id,created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const ids = (favorites ?? []).map((item) => item.game_id);
  if (!ids.length) {
    return { games: [], count: count ?? 0, page: safePage, pageSize: safeLimit };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("fusion_public_games")
    .select(gameFields)
    .in("id", ids);

  if (rowsError) throw rowsError;

  const mapped = rememberRows(rows ?? []);
  const byId = new Map(mapped.map((game) => [game.id, game]));

  return {
    games: ids.map((id) => byId.get(id)).filter(Boolean),
    count: count ?? 0,
    page: safePage,
    pageSize: safeLimit,
  };
}

export async function fetchFavoriteGames(limit = 8) {
  return (await fetchFavoritePage({ page: 1, limit })).games;
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
