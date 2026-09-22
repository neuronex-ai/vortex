import { supabase } from "../lib/supabase.js";
import { getFamilyFriendlyCatalog } from "../../lib/steam-catalog-client.ts";
import { mergeCatalogGame, pageCatalog, sourcesForGame } from "./catalogModel.mjs";

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
    let metadataUnavailable = false;
    for (let start = 0; start < entries.length; start += 100) {
      try {
        const { data, error } = await supabase.from("games").select(gameFields)
          .in("steam_app_id", entries.slice(start, start + 100).map(game => game.appId))
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        for (const row of data ?? []) metadata.set(Number(row.steam_app_id), mapGameRow(row));
      } catch { metadataUnavailable = true; }
    }
    return { games: entries.map(entry => mergeCatalogGame(entry, metadata.get(entry.appId), sourcesForGame(entry.appId, localSources, references))), metadataUnavailable };
  })().catch(error => { catalogCache = null; cacheExpires = 0; throw error; });
  return catalogCache;
}

export async function fetchGamePage(options = {}) {
  const { games, metadataUnavailable } = await loadPublicCatalog();
  return { ...pageCatalog(games, options), metadataUnavailable };
}

export async function fetchGameBySlug(slug) {
  return (await loadPublicCatalog()).games.find(game => game.slug === slug) ?? null;
}

export async function hydrateGameDetails(game) {
  return (await loadPublicCatalog()).games.find(item => item.steamAppId === game.steamAppId) ?? game;
}

export async function fetchFeaturedCoop() {
  return (await fetchGamePage({ filter: "Coop local", limit: 4 })).games;
}

export async function fetchDistributionSources(appId) {
  return (await loadPublicCatalog()).games.find(game => game.steamAppId === Number(appId))?.sources ?? [];
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function fetchFavoritePage({ page = 1, limit = PAGE_SIZE } = {}) {
  const user = await currentUser();
  if (!user) return { games: [], count: 0, page: 1, pageSize: limit };
  const { games, metadataUnavailable } = await loadPublicCatalog();
  if (metadataUnavailable) throw new Error("Não foi possível consultar seus favoritos agora.");
  const byId = new Map(games.filter(game => typeof game.id === "number").map(game => [game.id, game]));
  const safeLimit = Math.min(Math.max(limit, 1), PAGE_SIZE);
  const safePage = Math.max(page, 1);
  if (!byId.size) return { games: [], count: 0, page: safePage, pageSize: safeLimit };
  const from = (safePage - 1) * safeLimit;
  const { data, error, count } = await supabase.from("game_favorites")
    .select("game_id,created_at", { count: "exact" }).eq("user_id", user.id)
    .in("game_id", [...byId.keys()]).order("created_at", { ascending: false }).range(from, from + safeLimit - 1);
  if (error) throw error;
  return { games: (data ?? []).map(item => byId.get(item.game_id)).filter(Boolean), count: count ?? 0, page: safePage, pageSize: safeLimit };
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
