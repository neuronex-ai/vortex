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

CONTEXTO DO PRODUTO
- Fusion é um catálogo de jogos para PC que usa a Steam como fonte oficial de metadados e loja.
- O catálogo público do Fusion já filtra conteúdo adulto/sexual.
- O Fusion pode ter referências externas de download já cadastradas e ativas. Você só pode citar provedores e URLs que as ferramentas retornarem; nunca invente disponibilidade nem links.
- Fontes externas são referências de terceiros. O Fusion não hospeda nem baixa arquivos.
- Para jogo local, diferencie:
  1) "nativo": a Steam informa coop local ou tela dividida; Nucleus não é necessário;
  2) "Nucleus": há handler encontrado no SplitScreen.Me Handlers Hub;
  3) "não verificado": nenhuma das condições acima foi confirmada.
- Quando houver handler do Nucleus, informe se ele está verificado.
- Para recomendações como "jogos do tipo X", use o jogo de referência e dados reais do catálogo. Priorize semelhança de gêneros/categorias e popularidade, respeitando os filtros pedidos.
- Se o usuário pedir N jogos e as ferramentas confirmarem menos, entregue apenas os confirmados e explique a limitação.
- Para disponibilidade de download, mostre apenas Steam e os provedores externos retornados pelas ferramentas.
- Responda em português do Brasil, salvo pedido explícito em outro idioma.
- Seja direto, útil e natural. Não mencione nomes internos de funções, banco, RPC, tool calling, Supabase ou implementação.
- Não exponha raciocínio interno.
`.trim();

const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Pesquisa o catálogo real do Fusion/Steam por título e filtros. Use para localizar jogos e verificar recursos.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou termo do jogo." },
          genres: { type: "array", items: { type: "string" }, description: "Gêneros desejados." },
          local_coop: { type: "boolean", description: "Exigir coop local informado pela Steam." },
          split_screen: { type: "boolean", description: "Exigir tela dividida informada pela Steam." },
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
      description: "Obtém detalhes de um jogo, incluindo Steam, recursos locais e fontes externas já conhecidas.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome do jogo." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_similar_games",
      description: "Recomenda jogos semelhantes a um título de referência, podendo exigir coop/tela dividida nativos ou compatibilidade Nucleus.",
      parameters: {
        type: "object",
        properties: {
          reference_query: { type: "string", description: "Jogo usado como referência, por exemplo Resident Evil 5." },
          local_mode: {
            type: "string",
            enum: ["any", "native", "nucleus_or_native"],
            description: "any = qualquer modo; native = coop/tela dividida nativos; nucleus_or_native = nativo ou handler Nucleus confirmado.",
          },
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
      description: "Retorna as fontes externas já cadastradas/ativas no Fusion para Steam App IDs específicos.",
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
      description: "Consulta o Handlers Hub oficial do SplitScreen.Me para verificar suporte Nucleus Co-op de um ou mais jogos.",
      parameters: {
        type: "object",
        properties: {
          titles: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 15,
          },
        },
        required: ["titles"],
        additionalProperties: false,
      },
    },
  },
];

function clampLimit(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
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
    .replace(/\bgame\s+of\s+the\s+year(?:\s+edition)?\b/g, " goty ")
    .replace(/\bg\.?\s*o\.?\s*t\.?\s*y\.?(?:\s+edition)?\b/g, " goty ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => roman.get(token) ?? token)
    .filter((token) => token !== "the")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function arraysOverlap(left: unknown, right: unknown) {
  const a = new Set((Array.isArray(left) ? left : []).map((v) => String(v).toLowerCase()));
  return (Array.isArray(right) ? right : []).some((v) => a.has(String(v).toLowerCase()));
}

function similarityScore(reference: any, game: any) {
  const refGenres = new Set((reference.genres ?? []).map((v: string) => v.toLowerCase()));
  const refCategories = new Set((reference.categories ?? []).map((v: string) => v.toLowerCase()));
  let score = 0;
  for (const value of game.genres ?? []) if (refGenres.has(String(value).toLowerCase())) score += 5;
  for (const value of game.categories ?? []) if (refCategories.has(String(value).toLowerCase())) score += 2;
  if (reference.controller_support && game.controller_support) score += 1;
  if (reference.local_coop && game.local_coop) score += 2;
  if (reference.shared_split_screen && game.shared_split_screen) score += 2;
  score += Math.min(3, Math.log10(1 + Number(game.recommendations_total ?? 0)));
  return score;
}

const publicFields = [
  "id", "steam_app_id", "slug", "title", "short_description", "release_year",
  "header_image", "genres", "categories", "developers", "publishers",
  "local_coop", "shared_split_screen", "controller_support",
  "metacritic_score", "recommendations_total", "popularity_score", "steam_store_url",
].join(",");

async function searchCatalog(args: any) {
  const query = String(args?.query ?? "").trim().slice(0, 80);
  const limit = clampLimit(args?.limit, 10, 20);

  const run = async () => {
    let q = admin
      .from("fusion_public_games")
      .select(publicFields)
      .order("popularity_score", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (query) q = q.ilike("title", `%${query.replace(/[%_]/g, "")}%`);
    if (args?.local_coop === true) q = q.eq("local_coop", true);
    if (args?.split_screen === true) q = q.eq("shared_split_screen", true);
    if (Array.isArray(args?.genres) && args.genres.length) q = q.overlaps("genres", args.genres.slice(0, 8));

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  };

  let rows = await run();

  if (query.length >= 2 && rows.length < Math.min(5, limit)) {
    try {
      await admin.rpc("search_steam_fallback_ids", { p_query: query, p_limit: 8 });
      rows = await run();
    } catch {
      // Existing catalog results remain valid if Steam fallback is temporarily unavailable.
    }
  }

  return rows.map((row: any) => ({
    steamAppId: Number(row.steam_app_id),
    title: row.title,
    description: row.short_description,
    year: row.release_year,
    genres: row.genres ?? [],
    categories: row.categories ?? [],
    localCoop: Boolean(row.local_coop),
    splitScreen: Boolean(row.shared_split_screen),
    controllerSupport: row.controller_support,
    metacritic: row.metacritic_score,
    recommendations: Number(row.recommendations_total ?? 0),
    steamUrl: row.steam_store_url || `https://store.steampowered.com/app/${row.steam_app_id}/`,
  }));
}

async function findGame(query: string) {
  const term = query.trim().slice(0, 80);
  const { data, error } = await admin.rpc("browse_fusion_catalog", {
    p_query: term,
    p_filter: "Todos",
    p_sort: "popular",
    p_offset: 0,
    p_limit: 8,
  });
  if (error) throw error;

  let rows = data ?? [];
  if (!rows.length && term.length >= 2) {
    try {
      await admin.rpc("search_steam_fallback_ids", { p_query: term, p_limit: 8 });
      const second = await admin.rpc("browse_fusion_catalog", {
        p_query: term,
        p_filter: "Todos",
        p_sort: "popular",
        p_offset: 0,
        p_limit: 8,
      });
      if (!second.error) rows = second.data ?? [];
    } catch {
      // No-op.
    }
  }

  if (!rows.length) return null;
  const normalized = normalizeTitle(term);
  return rows.find((row: any) => normalizeTitle(row.title) === normalized) ?? rows[0];
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
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const payload = await response.json();
      resolved = Array.isArray(payload?.results) ? payload.results : [];
    }
  } catch {
    // Fall back to already persisted cache.
  }

  const resolvedById = new Map(resolved.map((item: any) => [Number(item.appId), item.sources ?? []]));
  const missing = ids.filter((id) => !resolvedById.has(id));

  if (missing.length) {
    const { data } = await admin
      .from("game_source_cache")
      .select("steam_app_id,sources")
      .in("steam_app_id", missing);
    for (const row of data ?? []) resolvedById.set(Number(row.steam_app_id), row.sources ?? []);
  }

  return ids.map((appId) => ({
    steamAppId: appId,
    sources: (resolvedById.get(appId) ?? [])
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

async function nucleusForTitle(title: string) {
  const clean = title.trim().slice(0, 120);
  if (!clean) return { title, supported: false, handlers: [] };

  try {
    const response = await fetch(
      `https://hub.splitscreen.me/api/v1/handlers/${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } },
    );
    if (!response.ok) return { title, supported: false, handlers: [] };

    const payload = await response.json();
    const items = Array.isArray(payload?.Handlers) ? payload.Handlers : [];
    const target = normalizeTitle(clean);
    const handlers = items
      .filter((item: any) => {
        const name = item?.gameName ?? item?.title ?? "";
        return normalizeTitle(name) === target && item?.private !== true && item?.publicAuthorized !== false;
      })
      .slice(0, 4)
      .map((item: any) => ({
        id: item._id,
        title: item.gameName ?? item.title,
        verified: item.verified === true,
        maxPlayers: Number(item.maxPlayers ?? 0) || null,
        controllers: item.playableControllers !== false,
        mouseKeyboard: item.playableMouseKeyboard === true,
        description: item.description ?? null,
        updatedAt: item.updatedAt ?? null,
      }));

    return {
      title,
      supported: handlers.length > 0,
      verified: handlers.some((handler: any) => handler.verified),
      handlers,
    };
  } catch {
    return { title, supported: false, unavailable: true, handlers: [] };
  }
}

async function getExternalSources(args: any) {
  return resolveExternalSources(Array.isArray(args?.steam_app_ids) ? args.steam_app_ids : []);
}

async function checkNucleusSupport(args: any) {
  const titles = Array.isArray(args?.titles) ? args.titles.slice(0, 15).map(String) : [];
  return Promise.all(titles.map((title: string) => nucleusForTitle(title)));
}

async function getGameDetails(args: any) {
  const game = await findGame(String(args?.query ?? ""));
  if (!game) return { found: false };

  const [sources, nucleus] = await Promise.all([
    resolveExternalSources([Number(game.steam_app_id)]),
    nucleusForTitle(game.title),
  ]);

  return {
    found: true,
    game: {
      steamAppId: Number(game.steam_app_id),
      title: game.title,
      description: game.short_description,
      about: game.about_game,
      year: game.release_year,
      genres: game.genres ?? [],
      categories: game.categories ?? [],
      localCoop: Boolean(game.local_coop),
      splitScreen: Boolean(game.shared_split_screen),
      controllerSupport: game.controller_support,
      metacritic: game.metacritic_score,
      recommendations: Number(game.recommendations_total ?? 0),
      developers: game.developers ?? [],
      publishers: game.publishers ?? [],
      steamUrl: game.steam_store_url || `https://store.steampowered.com/app/${game.steam_app_id}/`,
    },
    externalSources: sources[0]?.sources ?? [],
    nucleus,
  };
}

async function findSimilarGames(args: any) {
  const reference = await findGame(String(args?.reference_query ?? ""));
  if (!reference) return { foundReference: false, games: [] };

  const mode = ["any", "native", "nucleus_or_native"].includes(args?.local_mode)
    ? args.local_mode
    : "any";
  const limit = clampLimit(args?.limit, 10, 15);

  let q = admin
    .from("fusion_public_games")
    .select(publicFields)
    .neq("steam_app_id", reference.steam_app_id)
    .order("popularity_score", { ascending: false, nullsFirst: false })
    .limit(60);

  if (Array.isArray(reference.genres) && reference.genres.length) {
    q = q.overlaps("genres", reference.genres);
  }

  if (mode === "native") {
    q = q.or("local_coop.eq.true,shared_split_screen.eq.true");
  }

  const { data, error } = await q;
  if (error) throw error;

  let candidates = (data ?? [])
    .map((game: any) => ({
      ...game,
      score: similarityScore(reference, game),
      nativeLocal: Boolean(game.local_coop || game.shared_split_screen),
    }))
    .sort((a: any, b: any) => b.score - a.score || Number(b.popularity_score ?? 0) - Number(a.popularity_score ?? 0));

  const evaluated: any[] = [];
  if (mode === "nucleus_or_native") {
    const probe = candidates.slice(0, 30);
    const nucleusResults = await Promise.all(
      probe.map((game: any) => game.nativeLocal ? Promise.resolve(null) : nucleusForTitle(game.title)),
    );

    for (let i = 0; i < probe.length; i += 1) {
      const game = probe[i];
      const nucleus = nucleusResults[i];
      if (game.nativeLocal || nucleus?.supported) {
        evaluated.push({ ...game, nucleus });
      }
      if (evaluated.length >= limit) break;
    }
    candidates = evaluated;
  } else {
    candidates = candidates.slice(0, limit);
  }

  const selected = candidates.slice(0, limit);
  const sourceRows = await resolveExternalSources(selected.map((game: any) => Number(game.steam_app_id)));
  const sourceMap = new Map(sourceRows.map((row: any) => [row.steamAppId, row.sources]));

  return {
    foundReference: true,
    reference: {
      steamAppId: Number(reference.steam_app_id),
      title: reference.title,
      genres: reference.genres ?? [],
      categories: reference.categories ?? [],
    },
    games: selected.map((game: any) => ({
      steamAppId: Number(game.steam_app_id),
      title: game.title,
      description: game.short_description,
      year: game.release_year,
      genres: game.genres ?? [],
      categories: game.categories ?? [],
      similarityScore: Number(game.score.toFixed(2)),
      localMode: game.nativeLocal ? "native" : game.nucleus?.supported ? "nucleus" : "not_verified",
      nativeLocalCoop: Boolean(game.local_coop),
      nativeSplitScreen: Boolean(game.shared_split_screen),
      nucleus: game.nucleus ?? null,
      controllerSupport: game.controller_support,
      metacritic: game.metacritic_score,
      recommendations: Number(game.recommendations_total ?? 0),
      steamUrl: game.steam_store_url || `https://store.steampowered.com/app/${game.steam_app_id}/`,
      externalSources: sourceMap.get(Number(game.steam_app_id)) ?? [],
    })),
  };
}

async function executeTool(name: string, args: any) {
  switch (name) {
    case "search_catalog":
      return searchCatalog(args);
    case "get_game_details":
      return getGameDetails(args);
    case "find_similar_games":
      return findSimilarGames(args);
    case "get_external_sources":
      return getExternalSources(args);
    case "check_nucleus_support":
      return checkNucleusSupport(args);
    default:
      return { error: "Unknown tool" };
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
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 1400,
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
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`NVIDIA ${response.status}: ${detail}`);
  }

  return response.json();
}

async function runAgent(history: any[]) {
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  for (let round = 0; round < 5; round += 1) {
    const response = await callNvidia(messages);
    const message = response?.choices?.[0]?.message;
    if (!message) throw new Error("NVIDIA returned no assistant message");

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      return {
        content: String(message.content ?? "").trim(),
        model: response.model ?? NVIDIA_MODEL,
        usage: response.usage ?? null,
      };
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls.slice(0, 4)) {
      let args = {};
      try {
        args = JSON.parse(call?.function?.arguments ?? "{}");
      } catch {
        args = {};
      }

      let result: unknown;
      try {
        result = await executeTool(call?.function?.name ?? "", args);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "Tool failed" };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call?.function?.name,
        content: JSON.stringify(result).slice(0, 30000),
      });
    }
  }

  const final = await callNvidia([
    ...messages,
    {
      role: "system",
      content: "Agora responda ao usuário com os dados já obtidos. Não faça novas chamadas de ferramenta.",
    },
  ], "none", false);

  return {
    content: String(final?.choices?.[0]?.message?.content ?? "").trim(),
    model: final?.model ?? NVIDIA_MODEL,
    usage: final?.usage ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!NVIDIA_API_KEY) {
    return json({
      error: "Fusion AI ainda não está configurado.",
      code: "nvidia_not_configured",
    }, 503);
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
    const messages = sanitizeMessages(body?.messages);
    if (!messages.length || messages.at(-1)?.role !== "user") {
      return json({ error: "Invalid conversation" }, 400);
    }

    const startedAt = performance.now();
    const result = await runAgent(messages);
    const latencyMs = Math.round(performance.now() - startedAt);

    return json({
      reply: result.content || "Não consegui formular uma resposta agora.",
      model: result.model,
      usage: result.usage,
      latencyMs,
    });
  } catch (error) {
    console.error("fusion-ai error", error);
    return json({
      error: "Não foi possível consultar o Fusion AI agora. Tente novamente em instantes.",
      code: "fusion_ai_failed",
    }, 502);
  }
});
