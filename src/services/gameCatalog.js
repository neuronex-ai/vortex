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
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
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
  return {
    id: row.id,
    steamAppId: row.steam_app_id,
    slug: row.slug,
    title: row.title,
    description: row.short_description || "Descrição não disponível.",
    about: textOnly(row.about_game || row.short_description || ""),
    image: row.header_image,
    year: row.release_year,
    releaseDate: row.release_date,
    isFree: row.is_free,
    requiredAge: row.required_age,
    localCoop: row.local_coop,
    splitScreen: row.shared_split_screen,
    controllerSupport: row.controller_support,
    genres: row.genres ?? [],
    categories: row.categories ?? [],
    tags: (row.tags?.length ? row.tags : row.categories ?? []).slice(0, 8),
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

  const games = (data ?? []).map(mapGameRow);
  return {
    games,
    hasMore: games[0]?.hasMore ?? false,
    nextCursor: games.at(-1)?.cursor ?? null,
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

export async function fetchFeaturedCoop() {
  const result = await fetchGamePage({
    filter: "Coop local",
    sort: "popular",
    limit: 4,
  });

  return result.games;
}
