import { supabase } from "../lib/supabase.js";
import { getCatalog, getFamilyFriendlyCatalog } from "../../lib/steam-catalog-client.ts";
import { mergeCatalogGame, mergeSources, pageCatalog, sourcesForGame, steamEntry } from "./catalogModel.mjs";

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

let catalogCache;
let cacheExpires = 0;
async function loadPublicCatalog() {
  if (catalogCache && Date.now() < cacheExpires) return catalogCache;
  cacheExpires = Date.now() + 60_000;
  catalogCache = (async () => {
    const [entries, { default: localSources }, { default: references }] = await Promise.all([
      getFamilyFriendlyCatalog(), import("../../data/steam-sources.json"), import("../../data/steam-external-references.json"),
    ]);
    const metadata = new Map();
    const cachedSources = new Map();
    let metadataUnavailable = false;
    for (let start = 0; start < entries.length; start += 100) {
      const appIds = entries.slice(start, start + 100).map(game => game.appId);
      try {
        const { data, error } = await supabase.from("games").select(gameFields)
          .in("steam_app_id", appIds)
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        for (const row of data ?? []) metadata.set(Number(row.steam_app_id), mapGameRow(row));
      } catch { metadataUnavailable = true; }

      try {
        const { data, error } = await supabase.from("game_source_cache")
          .select("steam_app_id,sources,checked_at,next_check_at")
          .in("steam_app_id", appIds)
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        for (const row of data ?? []) cachedSources.set(Number(row.steam_app_id), row);
      } catch {
        // Static provider references remain available if the cache cannot be read.
      }
    }
    return {
      games: entries.map((entry) => {
        const staticSources = sourcesForGame(entry.appId, localSources, references, entry.title);
        const cache = cachedSources.get(entry.appId);
        const dynamicSources = (cache?.sources ?? []).map((source) => ({
          ...source,
          lastCheckedAt: source.lastCheckedAt ?? cache.checked_at ?? null,
        }));
        return mergeCatalogGame(
          entry,
          metadata.get(entry.appId),
          mergeSources(staticSources, dynamicSources),
        );
      }),
      metadataUnavailable,
    };
  })().catch(error => { catalogCache = null; cacheExpires = 0; throw error; });
  return catalogCache;
}

const discovered = new Map();
const searchCache = new Map();
async function enrichRows(rows) {
  const [{ catalog }, { default: local }, { default: references }] = await Promise.all([
    getCatalog(), import("../../data/steam-sources.json"), import("../../data/steam-external-references.json"),
  ]);
  return rows.map(row => {
    const entry = steamEntry(row, catalog.find(item => item.appId === Number(row.steam_app_id)));
    if (!entry.familyFriendly) return null;
    const game = mergeCatalogGame(entry, mapGameRow(row), sourcesForGame(entry.appId, local, references, entry.title));
    discovered.set(game.steamAppId, game);
    return game;
  }).filter(Boolean);
}

async function searchSteam(query) {
  const key = query.toLowerCase().trim();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < 60_000) return cached.value;
  const value = (async () => {
    const { data: ids, error } = await supabase.rpc("search_steam_fallback_ids", { p_query: query, p_limit: 8 })
      .abortSignal(AbortSignal.timeout(45000));
    if (error) throw error;
    if (!ids?.length) return [];
    const { data, error: rowError } = await supabase.from("games").select(gameFields).in("steam_app_id", ids)
      .abortSignal(AbortSignal.timeout(10000));
    if (rowError) throw rowError;
    return enrichRows(data ?? []);
  })().catch(error => { searchCache.delete(key); throw error; });
  if (searchCache.size >= 30) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { time: Date.now(), value });
  return value;
}

export async function fetchGamePage(options = {}) {
  const { games, metadataUnavailable } = await loadPublicCatalog();
  const query = options.query?.trim() ?? "";
  let steamSearchUnavailable = false;
  let extra = [];
  if (query.length >= 2 && query.length <= 80) {
    try { extra = await searchSteam(query); } catch { steamSearchUnavailable = true; }
  }
  const localMatches = pageCatalog(games, { query, limit: 20 }).games;
  const combined = query ? [...new Map([...localMatches, ...extra].map(game => [game.steamAppId, game])).values()] : games;
  return { ...pageCatalog(combined, { ...options, query: "" }), metadataUnavailable, steamSearchUnavailable };
}

export async function fetchGameBySlug(slug) {
  const cached = (await loadPublicCatalog()).games.find(game => game.slug === slug)
    ?? [...discovered.values()].find(game => game.slug === slug);
  if (cached) return cached;
  const { data, error } = await supabase.from("games").select(gameFields).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? (await enrichRows([data]))[0] ?? null : null;
}

export async function hydrateGameDetails(game) {
  return discovered.get(game.steamAppId) ?? (await loadPublicCatalog()).games.find(item => item.steamAppId === game.steamAppId) ?? game;
}

export async function fetchFeaturedCoop() {
  return (await fetchGamePage({ filter: "Coop local", limit: 4 })).games;
}

async function readSourceCache(appId) {
  const { data, error } = await supabase.from("game_source_cache")
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

  const knownGame = discovered.get(numericAppId)
    ?? (await loadPublicCatalog()).games.find(game => game.steamAppId === numericAppId);
  const staticSources = knownGame?.sources ?? [];

  let cache = null;
  try {
    cache = await readSourceCache(numericAppId);
  } catch {
    // Keep static provider matches available when the cache is temporarily unreachable.
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
      // Existing static/cache links are still returned if revalidation cannot run.
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
  const { data, error } = await supabase.from("game_favorites")
    .select(`game_id,created_at,games(${gameFields})`).eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const games = await enrichRows((data ?? []).map(item => item.games).filter(Boolean));
  const from = (safePage - 1) * safeLimit;
  return { games: games.slice(from, from + safeLimit), count: games.length, page: safePage, pageSize: safeLimit };
}

export async function fetchFavoriteGames(limit = 8) {
  const result = await fetchFavoritePage({ page: 1, limit });
  return result.games;
}

export async function addFavorite(gameId) {
  if (String(gameId).startsWith("steam:")) throw new Error("Os detalhes da Steam estão indisponíveis. Tente salvar novamente em instantes.");
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
