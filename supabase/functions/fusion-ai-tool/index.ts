import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const MODE_VALUES = new Set([
  "single_player",
  "multiplayer",
  "coop_any",
  "online_coop",
  "local_coop",
  "same_screen",
  "lan_coop",
  "online_pvp",
  "local_pvp",
  "crossplay",
  "remote_together",
]);

const publicFields = [
  "id", "steam_app_id", "slug", "title", "short_description", "about_game",
  "header_image", "release_year", "genres", "categories", "tags", "franchises",
  "steam_category_ids", "controller_support", "pc_requirements",
  "metacritic_score", "recommendations_total", "popularity_score", "steam_store_url",
].join(",");

function clampLimit(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : fallback;
}

function normalizeTitle(value: unknown) {
  const roman = new Map([
    ["i", "1"], ["ii", "2"], ["iii", "3"], ["iv", "4"], ["v", "5"],
    ["vi", "6"], ["vii", "7"], ["viii", "8"], ["ix", "9"], ["x", "10"],
  ]);
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[™®©]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => roman.get(token) ?? token)
    .filter((token) => token !== "the")
    .join(" ")
    .trim();
}

function capabilityFlags(row: any) {
  const ids = new Set((row?.steam_category_ids ?? []).map(Number));
  return {
    singlePlayer: ids.has(2),
    multiplayer: ids.has(1),
    coop: ids.has(9),
    onlineCoop: ids.has(38),
    localCoopNative: ids.has(39),
    sameScreen: ids.has(24) || ids.has(37) || ids.has(39),
    lanCoop: ids.has(48),
    onlinePvp: ids.has(36),
    localPvp: ids.has(37),
    crossplay: ids.has(27),
    remoteTogether: ids.has(44),
    fullController: ids.has(28),
    controller: ids.has(18) || ids.has(28) || ids.has(60),
  };
}

function playLabels(row: any) {
  const flags = capabilityFlags(row);
  const labels: string[] = [];
  if (flags.localCoopNative) labels.push("Coop local nativo");
  if (flags.sameScreen) labels.push("Na mesma tela");
  if (flags.onlineCoop) labels.push("Coop online");
  if (flags.lanCoop) labels.push("Coop em LAN");
  if (!labels.length && flags.coop) labels.push("Coop");
  if (!labels.length && flags.multiplayer) labels.push("Multiplayer");
  if (!labels.length && flags.singlePlayer) labels.push("Um jogador");
  return labels;
}

function gameRef(row: any, extras: Record<string, unknown> = {}) {
  return {
    steamAppId: Number(row.steam_app_id),
    slug: row.slug,
    title: row.title,
    image: row.header_image ?? null,
    year: row.release_year ?? null,
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    playLabels: playLabels(row),
    capabilities: capabilityFlags(row),
    steamUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
    ...extras,
  };
}

function filterPayload(args: any) {
  return {
    genres: Array.isArray(args?.genres) ? args.genres.slice(0, 8) : [],
    tags: Array.isArray(args?.tags) ? args.tags.slice(0, 10) : [],
    modes: Array.isArray(args?.modes)
      ? args.modes.filter((value: string) => MODE_VALUES.has(value)).slice(0, 8)
      : [],
    has_source: args?.has_external_source === true,
    nucleus: args?.nucleus === true,
    controller: ["any", "full"].includes(args?.controller) ? args.controller : "",
  };
}

async function cachedSources(appIds: number[]) {
  const ids = [...new Set(appIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 30);
  const map = new Map<number, any[]>();
  if (!ids.length) return map;

  const { data, error } = await admin
    .from("game_source_cache")
    .select("steam_app_id,sources")
    .in("steam_app_id", ids);
  if (error) throw error;

  for (const row of data ?? []) {
    map.set(
      Number(row.steam_app_id),
      (Array.isArray(row.sources) ? row.sources : [])
        .filter((source: any) => source?.url && source?.availability !== "unavailable")
        .map((source: any) => ({
          provider: source.providerName,
          url: source.url,
          status: source.status ?? null,
          availability: source.availability ?? "unknown",
          size: source.size ?? null,
        })),
    );
  }
  return map;
}

async function cachedNucleus(appIds: number[]) {
  const ids = [...new Set(appIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 30);
  const map = new Map<number, any>();
  if (!ids.length) return map;

  const { data, error } = await admin
    .from("nucleus_support_cache")
    .select("steam_app_id,supported,verified,max_players,handler_count,details,checked_at")
    .in("steam_app_id", ids);
  if (error) throw error;

  for (const row of data ?? []) {
    map.set(Number(row.steam_app_id), {
      supported: Boolean(row.supported),
      verified: Boolean(row.verified),
      maxPlayers: row.max_players ?? null,
      handlerCount: Number(row.handler_count ?? 0),
      handlers: Array.isArray(row.details) ? row.details : [],
      checkedAt: row.checked_at,
    });
  }
  return map;
}

async function findGame(query: string) {
  const term = String(query ?? "").trim().slice(0, 80);
  if (!term) return null;

  const lookup = async () => {
    const { data, error } = await admin.rpc("browse_fusion_catalog_v2", {
      p_query: term,
      p_filters: {},
      p_sort: "popular",
      p_offset: 0,
      p_limit: 8,
    });
    if (error) throw error;
    return data ?? [];
  };

  let rows = await lookup();
  if (!rows.length && term.length >= 2) {
    try {
      await admin.rpc("search_steam_fallback_ids", { p_query: term, p_limit: 8 });
      rows = await lookup();
    } catch {
      // Fast path can still return no result if Steam fallback is temporarily unavailable.
    }
  }

  const target = normalizeTitle(term);
  return rows.find((row: any) => normalizeTitle(row.title) === target) ?? rows[0] ?? null;
}

function rowMatchesFilters(row: any, args: any) {
  const flags = capabilityFlags(row);
  for (const mode of Array.isArray(args?.modes) ? args.modes : []) {
    if (mode === "single_player" && !flags.singlePlayer) return false;
    if (mode === "multiplayer" && !flags.multiplayer) return false;
    if (mode === "coop_any" && !flags.coop) return false;
    if (mode === "online_coop" && !flags.onlineCoop) return false;
    if (mode === "local_coop" && !flags.localCoopNative) return false;
    if (mode === "same_screen" && !flags.sameScreen) return false;
    if (mode === "lan_coop" && !flags.lanCoop) return false;
    if (mode === "online_pvp" && !flags.onlinePvp) return false;
    if (mode === "local_pvp" && !flags.localPvp) return false;
    if (mode === "crossplay" && !flags.crossplay) return false;
    if (mode === "remote_together" && !flags.remoteTogether) return false;
  }

  const lower = (values: any[]) => values.map((value) => String(value).toLowerCase());
  const genres = lower(row.genres ?? []);
  const tags = lower([...(row.tags ?? []), ...(row.genres ?? []), ...(row.categories ?? [])]);
  if (Array.isArray(args?.genres) && args.genres.some((value: string) => !genres.includes(value.toLowerCase()))) return false;
  if (Array.isArray(args?.tags) && args.tags.some((value: string) => !tags.includes(value.toLowerCase()))) return false;
  if (args?.controller === "full" && !flags.fullController) return false;
  if (args?.controller === "any" && !flags.controller) return false;
  return true;
}

async function searchCatalog(args: any) {
  const query = String(args?.query ?? "").trim().slice(0, 80);
  const limit = clampLimit(args?.limit, 10, 20);
  const filters = filterPayload(args);

  const lookup = async () => {
    const { data, error } = await admin.rpc("browse_fusion_catalog_v2", {
      p_query: query,
      p_filters: filters,
      p_sort: "popular",
      p_offset: 0,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  };

  let rows = await lookup();
  if (!rows.length && query.length >= 2) {
    try {
      await admin.rpc("search_steam_fallback_ids", { p_query: query, p_limit: 8 });
      rows = await lookup();
    } catch {
      // Keep empty result rather than blocking the chat on a second remote failure.
    }
  }

  const ids = rows.map((row: any) => Number(row.steam_app_id));
  const [sources, nucleus] = await Promise.all([cachedSources(ids), cachedNucleus(ids)]);

  return {
    filters,
    games: rows.map((row: any) => gameRef(row, {
      description: row.short_description,
      externalSources: sources.get(Number(row.steam_app_id)) ?? [],
      nucleus: nucleus.get(Number(row.steam_app_id)) ?? null,
    })),
  };
}

async function gameDetails(args: any) {
  const row = await findGame(String(args?.query ?? ""));
  if (!row) return { found: false };

  const id = Number(row.steam_app_id);
  const [sources, nucleus] = await Promise.all([cachedSources([id]), cachedNucleus([id])]);

  return {
    found: true,
    game: gameRef(row, {
      description: row.short_description,
      about: row.about_game,
      controllerSupport: row.controller_support,
      requirements: row.pc_requirements ?? {},
      metacritic: row.metacritic_score,
      recommendations: Number(row.recommendations_total ?? 0),
      externalSources: sources.get(id) ?? [],
      nucleus: nucleus.get(id) ?? null,
    }),
  };
}

async function similarGames(args: any) {
  const reference = await findGame(String(args?.reference_query ?? ""));
  if (!reference) return { foundReference: false, games: [] };

  const limit = clampLimit(args?.limit, 10, 15);
  const { data: rawIds, error: idsError } = await admin.rpc("steam_more_like_this_ids", {
    p_app_id: Number(reference.steam_app_id),
    p_count: Math.min(30, Math.max(limit * 2, 16)),
  });
  if (idsError) throw idsError;

  const ids = (Array.isArray(rawIds) ? rawIds : []).map(Number).filter(Boolean);
  if (!ids.length) return { foundReference: true, reference: gameRef(reference), games: [] };

  const { data, error } = await admin
    .from("fusion_public_games")
    .select(publicFields)
    .in("steam_app_id", ids);
  if (error) throw error;

  const byId = new Map((data ?? []).map((row: any) => [Number(row.steam_app_id), row]));
  let rows = ids.map((id) => byId.get(id)).filter(Boolean).filter((row) => rowMatchesFilters(row, args));

  const candidateIds = rows.map((row: any) => Number(row.steam_app_id));
  const [sources, nucleus] = await Promise.all([cachedSources(candidateIds), cachedNucleus(candidateIds)]);

  if (args?.has_external_source === true) {
    rows = rows.filter((row: any) => (sources.get(Number(row.steam_app_id)) ?? []).length > 0);
  }
  if (args?.nucleus === true) {
    rows = rows.filter((row: any) => nucleus.get(Number(row.steam_app_id))?.supported === true);
  }

  return {
    foundReference: true,
    reference: gameRef(reference),
    games: rows.slice(0, limit).map((row: any) => {
      const id = Number(row.steam_app_id);
      return gameRef(row, {
        description: row.short_description,
        externalSources: sources.get(id) ?? [],
        nucleus: nucleus.get(id) ?? null,
      });
    }),
  };
}

async function externalSources(args: any) {
  const ids = Array.isArray(args?.steam_app_ids) ? args.steam_app_ids.map(Number).slice(0, 20) : [];
  const sources = await cachedSources(ids);
  return ids.map((steamAppId) => ({ steamAppId, sources: sources.get(steamAppId) ?? [] }));
}

async function nucleusSupport(args: any) {
  const titles = Array.isArray(args?.titles) ? args.titles.slice(0, 15).map(String) : [];
  const games = [];
  for (const title of titles) {
    const game = await findGame(title);
    if (game) games.push(game);
  }
  const ids = games.map((game: any) => Number(game.steam_app_id));
  const nucleus = await cachedNucleus(ids);
  return games.map((game: any) => ({
    ...gameRef(game),
    nucleus: nucleus.get(Number(game.steam_app_id)) ?? { supported: false, cached: false },
  }));
}

async function openGame(args: any) {
  const row = await findGame(String(args?.query ?? ""));
  if (!row) return { found: false };
  const game = gameRef(row);
  return { found: true, game, action: { type: "open_game", game } };
}

async function executeTool(name: string, args: any) {
  switch (name) {
    case "search_catalog": return searchCatalog(args);
    case "get_game_details": return gameDetails(args);
    case "find_similar_games": return similarGames(args);
    case "get_external_sources": return externalSources(args);
    case "check_nucleus_support": return nucleusSupport(args);
    case "open_game": return openGame(args);
    default: return { error: `Ferramenta desconhecida: ${name}` };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json({ error: "Faça login para usar o Fusion AI.", code: "auth_required" }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return json({ error: "Faça login para usar o Fusion AI.", code: "auth_required" }, 401);
  }

  try {
    const raw = await request.text();
    if (raw.length > 40000) return json({ error: "Payload too large" }, 413);
    const body = JSON.parse(raw || "{}");
    const tool = String(body?.tool ?? "");
    if (!tool) return json({ error: "Missing tool" }, 400);

    const startedAt = performance.now();
    const result = await executeTool(tool, body?.args ?? {});
    return json({
      result,
      tool,
      latencyMs: Math.round(performance.now() - startedAt),
      source: "fusion-cache",
    });
  } catch (error) {
    console.error("fusion-ai-tool", error);
    return json({
      error: "Não foi possível consultar o catálogo agora.",
      code: "fusion_tool_failed",
    }, 502);
  }
});
