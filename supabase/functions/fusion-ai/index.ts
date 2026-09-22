import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY") ?? "";
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") ?? "openai/gpt-oss-20b";
const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `
Você é Fusion AI, o assistente de descoberta de jogos integrado ao Fusion.

REGRAS DO FUSION
- Use sempre dados reais retornados pelas ferramentas. Nunca invente jogo, recurso, compatibilidade ou link.
- Steam é a fonte principal para metadados, gêneros, tags, modos e recomendações de jogos similares.
- Fontes externas só podem ser citadas se a ferramenta retornar uma URL ativa. Fusion não hospeda nem baixa jogos.
- Responda em português do Brasil com termos curtos e fáceis.

NÃO MISTURE ESTES CONCEITOS
- "Multiplayer": mais de um jogador, mas não significa coop e não significa local.
- "Coop": jogo cooperativo, sem afirmar onde.
- "Coop online": cooperativo pela internet.
- "Coop local nativo": a Steam confirma modo cooperativo local/compartilhado; não precisa de Nucleus.
- "Na mesma tela": a Steam confirma modo de tela compartilhada/dividida. Diga "na mesma tela" quando não souber se a tela é fisicamente dividida.
- "Nucleus": compatibilidade separada, confirmada pelo Handlers Hub. Nucleus não transforma um jogo single-player puro em multiplayer. Não chame Nucleus de coop local nativo.
- Se um jogo só puder ser jogado localmente via Nucleus, diga exatamente isso.
- Tags comunitárias como "Cooperativo Local" ou "Tela Dividida" ajudam em descoberta/similaridade, mas não substituem a confirmação estrutural de modo nativo.

FILTROS
- Quando o usuário combinar condições, combine-as na mesma consulta. Exemplo: Terror + Na mesma tela + Fonte externa.
- "Terror" deve ser tratado como tag/tema quando necessário, não apenas como gênero.
- Use modos separados para um jogador, multiplayer, coop, coop online, coop local nativo, mesma tela, LAN, PvP, crossplay e Remote Play Together.
- Para Nucleus, confirme via ferramenta específica; não deduza por multiplayer ou coop.
- Se o usuário pedir fonte externa, confirme as fontes antes de afirmar que existe download externo.

SIMILARIDADE
- Para "parecido com", "similar a" ou "tipo X", use find_similar_games. A ferramenta parte das recomendações oficiais de similares da Steam e depois aplica os filtros do Fusion.
- Não reduza similaridade a um único gênero.
- Se o usuário pedir N resultados e menos forem confirmados, entregue apenas os confirmados.

INTERFACE
- Toda vez que recomendar ou listar jogos, use ferramentas para obter as referências reais; a interface colocará um botão de abrir ao lado de cada jogo.
- Se o usuário disser "abre", "mostra", "quero ver", "aqui tem X?" ou claramente estiver pedindo para ver um jogo específico na tela, use open_game para abrir o modal do Fusion de forma proativa.
- Não escreva URLs internas do Fusion na resposta.
- Não mencione nomes internos de funções, RPC, Supabase, tool calling ou implementação.
- Não exponha raciocínio interno.
`.trim();

const MODE_VALUES = [
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
];

const filterProperties = {
  genres: {
    type: "array",
    items: { type: "string" },
    description: "Gêneros oficiais em português, por exemplo Ação, Aventura, RPG.",
  },
  tags: {
    type: "array",
    items: { type: "string" },
    description: "Tags/temas da Steam em português, por exemplo Terror, Terror de Sobrevivência, Zumbis.",
  },
  modes: {
    type: "array",
    items: { type: "string", enum: MODE_VALUES },
    description: "Modos combináveis. local_coop é local nativo; same_screen é tela compartilhada/dividida; multiplayer não implica coop.",
  },
  has_external_source: {
    type: "boolean",
    description: "Exigir pelo menos uma fonte externa ativa já conhecida pelo Fusion.",
  },
  nucleus: {
    type: "boolean",
    description: "Exigir compatibilidade confirmada com Nucleus.",
  },
  controller: {
    type: "string",
    enum: ["any", "full"],
    description: "any = algum suporte a controle; full = suporte completo.",
  },
};

const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Pesquisa o catálogo real do Fusion usando filtros combináveis de gênero, tema, modo de jogo, Nucleus, controle e fonte externa.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou texto de busca opcional." },
          ...filterProperties,
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_game_details",
      description: "Obtém detalhes reais de um jogo, seus modos, requisitos, Nucleus e fontes externas.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_similar_games",
      description: "Busca jogos similares usando recomendações da Steam e refina com filtros combináveis do Fusion.",
      parameters: {
        type: "object",
        properties: {
          reference_query: { type: "string", description: "Jogo usado como referência." },
          ...filterProperties,
          limit: { type: "integer", minimum: 1, maximum: 15 },
        },
        required: ["reference_query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_external_sources",
      description: "Confirma fontes externas ativas para Steam App IDs.",
      parameters: {
        type: "object",
        properties: {
          steam_app_ids: {
            type: "array",
            items: { type: "integer" },
            minItems: 1,
            maxItems: 20,
          },
        },
        required: ["steam_app_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_nucleus_support",
      description: "Confirma compatibilidade com Nucleus para jogos reais do catálogo.",
      parameters: {
        type: "object",
        properties: {
          titles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 15 },
        },
        required: ["titles"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_game",
      description: "Abre um jogo específico no modal de detalhes do Fusion. Use quando o usuário pedir para ver/abrir um jogo ou fizer uma pergunta de interface sobre um título específico.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

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
  const labels = [];
  if (flags.localCoopNative) labels.push("Coop local nativo");
  if (flags.sameScreen) labels.push("Na mesma tela");
  if (flags.onlineCoop) labels.push("Coop online");
  if (flags.lanCoop) labels.push("Coop em LAN");
  if (!labels.length && flags.coop) labels.push("Coop");
  if (!labels.length && flags.multiplayer) labels.push("Multiplayer");
  if (!labels.length && flags.singlePlayer) labels.push("Um jogador");
  return labels;
}

const publicFields = [
  "id", "steam_app_id", "slug", "title", "short_description", "about_game",
  "header_image", "release_year", "genres", "categories", "tags", "franchises",
  "steam_category_ids", "controller_support", "pc_requirements",
  "metacritic_score", "recommendations_total", "popularity_score", "steam_store_url",
].join(",");

function gameRef(row: any, extras: any = {}) {
  if (!row) return null;
  return {
    steamAppId: Number(row.steam_app_id ?? row.steamAppId),
    slug: row.slug,
    title: row.title,
    image: row.header_image ?? row.image ?? null,
    year: row.release_year ?? row.year ?? null,
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    playLabels: row.playLabels ?? playLabels(row),
    ...extras,
  };
}

function filterPayload(args: any, includeDynamic = false) {
  const filters: any = {
    genres: Array.isArray(args?.genres) ? args.genres.slice(0, 8) : [],
    tags: Array.isArray(args?.tags) ? args.tags.slice(0, 10) : [],
    modes: Array.isArray(args?.modes) ? args.modes.filter((value: string) => MODE_VALUES.includes(value)).slice(0, 8) : [],
    has_source: includeDynamic && args?.has_external_source === true,
    nucleus: includeDynamic && args?.nucleus === true,
    controller: ["any", "full"].includes(args?.controller) ? args.controller : "",
  };
  return filters;
}

async function browseRows(query: string, args: any, target: number) {
  const filters = filterPayload(args, false);
  const rows: any[] = [];
  const pageSize = 21;
  const maxPages = (args?.nucleus || args?.has_external_source) ? 4 : 1;

  for (let page = 0; page < maxPages && rows.length < Math.max(target, pageSize); page += 1) {
    const { data, error } = await admin.rpc("browse_fusion_catalog_v2", {
      p_query: query,
      p_filters: filters,
      p_sort: "popular",
      p_offset: page * pageSize,
      p_limit: pageSize,
    });
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function resolveNucleus(games: any[]) {
  const input = games
    .filter(Boolean)
    .map((game) => ({
      steamAppId: Number(game.steam_app_id ?? game.steamAppId),
      title: String(game.title ?? ""),
    }))
    .filter((game) => game.steamAppId > 0 && game.title)
    .slice(0, 20);

  if (!input.length) return [];

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/resolve-nucleus-support`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ games: input }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.results) ? payload.results : [];
  } catch {
    return [];
  }
}

async function resolveExternalSources(appIds: number[]) {
  const ids = [...new Set(appIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
  if (!ids.length) return [];

  let resolved: any[] = [];
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/resolve-game-sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ appIds: ids }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const payload = await response.json();
      resolved = Array.isArray(payload?.results) ? payload.results : [];
    }
  } catch {
    // persisted cache below remains usable
  }

  const map = new Map(resolved.map((item: any) => [Number(item.appId), item.sources ?? []]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const { data } = await admin.from("game_source_cache").select("steam_app_id,sources").in("steam_app_id", missing);
    for (const row of data ?? []) map.set(Number(row.steam_app_id), row.sources ?? []);
  }

  return ids.map((appId) => ({
    steamAppId: appId,
    sources: (map.get(appId) ?? [])
      .filter((source: any) => source?.url && source?.availability !== "unavailable")
      .map((source: any) => ({
        provider: source.providerName,
        url: source.url,
        status: source.status,
        availability: source.availability ?? "unknown",
        size: source.size ?? null,
      })),
  }));
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
      // Keep empty result.
    }
  }

  const target = normalizeTitle(term);
  return rows.find((row: any) => normalizeTitle(row.title) === target) ?? rows[0] ?? null;
}

async function searchCatalog(args: any) {
  const query = String(args?.query ?? "").trim().slice(0, 80);
  const limit = clampLimit(args?.limit, 10, 20);

  let rows = await browseRows(query, args, limit);

  if (query.length >= 2 && rows.length < Math.min(5, limit)) {
    try {
      await admin.rpc("search_steam_fallback_ids", { p_query: query, p_limit: 8 });
      rows = await browseRows(query, args, limit);
    } catch {
      // Existing results remain valid.
    }
  }

  let sourceMap = new Map<number, any[]>();
  if (args?.has_external_source === true && rows.length) {
    const allSources = [];
    for (let index = 0; index < rows.length; index += 20) {
      allSources.push(...await resolveExternalSources(
        rows.slice(index, index + 20).map((row: any) => Number(row.steam_app_id)),
      ));
    }
    sourceMap = new Map(allSources.map((item: any) => [item.steamAppId, item.sources]));
    rows = rows.filter((row: any) => (sourceMap.get(Number(row.steam_app_id)) ?? []).length > 0);
  }

  let nucleusMap = new Map<number, any>();
  if (args?.nucleus === true && rows.length) {
    const checked = [];
    for (let index = 0; index < rows.length; index += 20) {
      checked.push(...await resolveNucleus(rows.slice(index, index + 20)));
    }
    nucleusMap = new Map(checked.map((item: any) => [Number(item.steamAppId), item]));
    rows = rows.filter((row: any) => nucleusMap.get(Number(row.steam_app_id))?.supported);
  }

  const selected = rows.slice(0, limit);

  if (args?.has_external_source !== true && selected.length) {
    const sourceRows = await resolveExternalSources(selected.map((row: any) => Number(row.steam_app_id)));
    sourceMap = new Map(sourceRows.map((item: any) => [item.steamAppId, item.sources]));
  }

  return {
    filters: filterPayload(args, true),
    games: selected.map((row: any) => ({
      ...gameRef(row),
      description: row.short_description,
      capabilities: capabilityFlags(row),
      nucleus: nucleusMap.get(Number(row.steam_app_id)) ?? null,
      externalSources: sourceMap.get(Number(row.steam_app_id)) ?? [],
      steamUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
    })),
  };
}

async function getGameDetails(args: any) {
  const row = await findGame(args?.query);
  if (!row) return { found: false };

  const [sources, nucleus] = await Promise.all([
    resolveExternalSources([Number(row.steam_app_id)]),
    resolveNucleus([row]),
  ]);

  return {
    found: true,
    game: {
      ...gameRef(row),
      description: row.short_description,
      about: row.about_game,
      capabilities: capabilityFlags(row),
      controllerSupport: row.controller_support,
      requirements: row.pc_requirements ?? {},
      metacritic: row.metacritic_score,
      recommendations: Number(row.recommendations_total ?? 0),
      steamUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
    },
    externalSources: sources[0]?.sources ?? [],
    nucleus: nucleus[0] ?? null,
  };
}

function rowMatchesFilters(row: any, args: any) {
  const flags = capabilityFlags(row);
  const modes = Array.isArray(args?.modes) ? args.modes : [];
  for (const mode of modes) {
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
  const gameGenres = lower(row.genres ?? []);
  const gameTags = lower([...(row.tags ?? []), ...(row.genres ?? []), ...(row.categories ?? [])]);
  if (Array.isArray(args?.genres) && args.genres.some((value: string) => !gameGenres.includes(value.toLowerCase()))) return false;
  if (Array.isArray(args?.tags) && args.tags.some((value: string) => !gameTags.includes(value.toLowerCase()))) return false;
  if (args?.controller === "full" && !flags.fullController) return false;
  if (args?.controller === "any" && !flags.controller) return false;
  return true;
}

async function findSimilarGames(args: any) {
  const reference = await findGame(args?.reference_query);
  if (!reference) return { foundReference: false, games: [] };

  const limit = clampLimit(args?.limit, 10, 15);
  const { data: rawIds, error: idsError } = await admin.rpc("steam_more_like_this_ids", {
    p_app_id: Number(reference.steam_app_id),
    p_count: 30,
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

  let sourceMap = new Map<number, any[]>();
  if (args?.has_external_source === true && rows.length) {
    const sourceRows = [];
    for (let index = 0; index < rows.length; index += 20) {
      sourceRows.push(...await resolveExternalSources(
        rows.slice(index, index + 20).map((row: any) => Number(row.steam_app_id)),
      ));
    }
    sourceMap = new Map(sourceRows.map((item: any) => [item.steamAppId, item.sources]));
    rows = rows.filter((row: any) => (sourceMap.get(Number(row.steam_app_id)) ?? []).length > 0);
  }

  let nucleusMap = new Map<number, any>();
  if (args?.nucleus === true && rows.length) {
    const checked = [];
    for (let index = 0; index < rows.length; index += 20) {
      checked.push(...await resolveNucleus(rows.slice(index, index + 20)));
    }
    nucleusMap = new Map(checked.map((item: any) => [Number(item.steamAppId), item]));
    rows = rows.filter((row: any) => nucleusMap.get(Number(row.steam_app_id))?.supported);
  }

  const selected = rows.slice(0, limit);
  if (args?.has_external_source !== true && selected.length) {
    const sourceRows = await resolveExternalSources(selected.map((row: any) => Number(row.steam_app_id)));
    sourceMap = new Map(sourceRows.map((item: any) => [item.steamAppId, item.sources]));
  }

  return {
    foundReference: true,
    reference: gameRef(reference),
    games: selected.map((row: any) => ({
      ...gameRef(row),
      description: row.short_description,
      capabilities: capabilityFlags(row),
      nucleus: nucleusMap.get(Number(row.steam_app_id)) ?? null,
      externalSources: sourceMap.get(Number(row.steam_app_id)) ?? [],
      steamUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
    })),
  };
}

async function getExternalSources(args: any) {
  return resolveExternalSources(Array.isArray(args?.steam_app_ids) ? args.steam_app_ids : []);
}

async function checkNucleusSupport(args: any) {
  const titles = (Array.isArray(args?.titles) ? args.titles : []).slice(0, 15).map(String);
  const games = [];
  for (const title of titles) {
    const row = await findGame(title);
    if (row) games.push(row);
  }
  return resolveNucleus(games);
}

async function openGame(args: any) {
  const row = await findGame(args?.query);
  if (!row) return { found: false };
  const game = gameRef(row);
  return {
    found: true,
    game,
    action: { type: "open_game", game },
  };
}

async function executeTool(name: string, args: any) {
  switch (name) {
    case "search_catalog": return searchCatalog(args);
    case "get_game_details": return getGameDetails(args);
    case "find_similar_games": return findSimilarGames(args);
    case "get_external_sources": return getExternalSources(args);
    case "check_nucleus_support": return checkNucleusSupport(args);
    case "open_game": return openGame(args);
    default: return { error: "Unknown tool" };
  }
}

function sanitizeMessages(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-16)
    .filter((message: any) => ["user", "assistant"].includes(message?.role))
    .map((message: any) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, 6000),
    }))
    .filter((message: any) => message.content.trim());
}

async function callNvidia(messages: any[], toolChoice: any = "auto", includeTools = true) {
  const body: any = {
    model: NVIDIA_MODEL,
    messages,
    temperature: 0.15,
    top_p: 0.9,
    max_tokens: 1600,
    stream: false,
  };
  if (includeTools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const response = await fetch(NVIDIA_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`NVIDIA ${response.status}: ${detail}`);
  }
  return response.json();
}

function collectGameReferences(value: any, games: Map<number, any>, actions: any[]) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectGameReferences(item, games, actions);
    return;
  }
  if (typeof value !== "object") return;

  if (value.action?.type === "open_game" && value.action?.game?.slug) {
    actions.push(value.action);
  }

  const appId = Number(value.steamAppId ?? value.steam_app_id);
  if (appId > 0 && value.title && value.slug) {
    games.set(appId, {
      steamAppId: appId,
      slug: value.slug,
      title: value.title,
      image: value.image ?? value.header_image ?? null,
      year: value.year ?? value.release_year ?? null,
      playLabels: value.playLabels ?? [],
    });
  }

  for (const child of Object.values(value)) {
    if (child !== value) collectGameReferences(child, games, actions);
  }
}

async function runAgent(history: any[]) {
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const games = new Map<number, any>();
  const actions: any[] = [];

  for (let round = 0; round < 6; round += 1) {
    const response = await callNvidia(messages);
    const message = response?.choices?.[0]?.message;
    if (!message) throw new Error("NVIDIA returned no assistant message");

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      return {
        content: String(message.content ?? "").trim(),
        model: response.model ?? NVIDIA_MODEL,
        usage: response.usage ?? null,
        games: [...games.values()].slice(0, 20),
        actions: actions.slice(0, 4),
      };
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls.slice(0, 5)) {
      let args = {};
      try { args = JSON.parse(call?.function?.arguments ?? "{}"); } catch { args = {}; }

      let result: any;
      try {
        result = await executeTool(call?.function?.name ?? "", args);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "Tool failed" };
      }

      collectGameReferences(result, games, actions);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call?.function?.name,
        content: JSON.stringify(result).slice(0, 36000),
      });
    }
  }

  const final = await callNvidia([
    ...messages,
    { role: "system", content: "Responda agora usando somente os dados já obtidos. Não faça novas chamadas." },
  ], "none", false);

  return {
    content: String(final?.choices?.[0]?.message?.content ?? "").trim(),
    model: final?.model ?? NVIDIA_MODEL,
    usage: final?.usage ?? null,
    games: [...games.values()].slice(0, 20),
    actions: actions.slice(0, 4),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!NVIDIA_API_KEY) {
    return json({ error: "Fusion AI ainda não está configurado.", code: "nvidia_not_configured" }, 503);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Faça login para usar o Fusion AI.", code: "auth_required" }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return json({ error: "Faça login para usar o Fusion AI.", code: "auth_required" }, 401);
  }

  try {
    const raw = await request.text();
    if (raw.length > 120000) return json({ error: "Conversation too large" }, 413);
    const body = JSON.parse(raw);
    const history = sanitizeMessages(body?.messages);
    if (!history.length || history.at(-1)?.role !== "user") return json({ error: "Invalid conversation" }, 400);

    const startedAt = performance.now();
    const result = await runAgent(history);

    return json({
      reply: result.content || "Não consegui formular uma resposta agora.",
      model: result.model,
      usage: result.usage,
      latencyMs: Math.round(performance.now() - startedAt),
      games: result.games,
      actions: result.actions,
    });
  } catch (error) {
    console.error("fusion-ai error", error);
    return json({
      error: "Não foi possível consultar o Fusion AI agora. Tente novamente em instantes.",
      code: "fusion_ai_failed",
    }, 502);
  }
});
