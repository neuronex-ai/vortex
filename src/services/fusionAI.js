import { supabase } from "../lib/supabase.js";

const DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";
const PRIMARY_MODEL = "gpt-5.6-luna";
const TURN_TIMEOUT_MS = 12_000;
const KEEPALIVE_MS = 8_000;

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
    description: "Gêneros oficiais em português, por exemplo Ação, Aventura e RPG.",
  },
  tags: {
    type: "array",
    items: { type: "string" },
    description: "Temas/tags da Steam em português, por exemplo Terror, Zumbis e Sobrevivência.",
  },
  modes: {
    type: "array",
    items: { type: "string", enum: MODE_VALUES },
    description: "Modos combináveis. local_coop é local nativo; same_screen é mesma tela; multiplayer não implica coop.",
  },
  has_external_source: {
    type: "boolean",
    description: "Exigir fonte externa já conhecida e ativa no cache do Fusion.",
  },
  nucleus: {
    type: "boolean",
    description: "Exigir compatibilidade Nucleus já verificada pelo Fusion.",
  },
  controller: {
    type: "string",
    enum: ["any", "full"],
    description: "any = algum suporte a controle; full = suporte completo.",
  },
};

const FUNCTIONS = [
  {
    name: "search_catalog",
    description: "Pesquisa o catálogo real do Fusion por texto e filtros combináveis. Retorna jogos, modos, fontes em cache e compatibilidade Nucleus quando conhecida.",
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
  {
    name: "get_game_details",
    description: "Obtém detalhes reais de um jogo do Fusion, incluindo modos, requisitos, fontes em cache e Nucleus quando conhecido.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "find_similar_games",
    description: "Busca jogos similares a um título usando a similaridade da Steam e aplica filtros do Fusion.",
    parameters: {
      type: "object",
      properties: {
        reference_query: { type: "string", description: "Jogo de referência." },
        ...filterProperties,
        limit: { type: "integer", minimum: 1, maximum: 15 },
      },
      required: ["reference_query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_external_sources",
    description: "Retorna fontes externas já salvas no Fusion para Steam App IDs específicos, sem revalidar scrapers ao vivo.",
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
  {
    name: "check_nucleus_support",
    description: "Consulta o cache de compatibilidade Nucleus verificado pelo Fusion para os títulos informados.",
    parameters: {
      type: "object",
      properties: {
        titles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 15 },
      },
      required: ["titles"],
      additionalProperties: false,
    },
  },
  {
    name: "open_game",
    description: "Localiza um jogo para a interface abrir seu modal de detalhes. Use quando o usuário pedir para abrir, mostrar ou ver um título específico.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `
Você é Fusion AI, o assistente rápido de descoberta de jogos do Fusion.

OBJETIVO
- Responda em português do Brasil, de forma direta, útil e curta.
- Para qualquer afirmação sobre jogos, catálogo, modos, Nucleus ou fontes, use as ferramentas. Nunca invente disponibilidade.
- Prefira uma única chamada de ferramenta bem filtrada em vez de várias consultas sucessivas.

TAXONOMIA
- Multiplayer não significa coop e não significa local.
- Coop online é cooperativo pela internet.
- Coop local nativo é confirmado pela Steam e não precisa de Nucleus.
- Na mesma tela significa shared/split screen confirmado pela Steam; não afirme que a tela é fisicamente dividida quando isso não estiver claro.
- Nucleus é uma compatibilidade separada. Não chame Nucleus de coop local nativo.
- Tags comunitárias ajudam descoberta, mas não substituem a confirmação estrutural do modo.

BUSCA
- Combine todos os filtros pedidos pelo usuário na mesma consulta.
- Terror deve ser tratado como tag/tema quando necessário.
- Se o usuário pedir fonte externa, passe has_external_source=true já na busca principal.
- Se o usuário pedir Nucleus, passe nucleus=true já na busca principal.
- Para parecido/similar/tipo X, use find_similar_games.
- Se menos jogos forem confirmados que a quantidade pedida, entregue somente os confirmados.

INTERFACE
- Quando listar jogos, use as referências retornadas pelas ferramentas; o Fusion cria os cards clicáveis automaticamente.
- Se o usuário pedir para abrir/mostrar/ver um jogo específico, use open_game.
- Não exponha URLs internas, nomes de RPC, Supabase, function calling ou implementação.
- Não exponha raciocínio interno.
`.trim();

let socket = null;
let readyPromise = null;
let settingsReady = false;
let keepAliveTimer = null;
let pendingTurn = null;
let sessionRequestId = null;
let latestLatency = null;

function collectGameReferences(value, games, actions) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectGameReferences(item, games, actions));
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

  Object.values(value).forEach((child) => {
    if (child !== value) collectGameReferences(child, games, actions);
  });
}

function safeHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      type: "History",
      role: message.role,
      content: String(message.content ?? "").slice(0, 4000),
    }))
    .filter((message) => message.content.trim());
}

function sendSocket(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("DEEPGRAM_DISCONNECTED");
  socket.send(JSON.stringify(payload));
}

function cleanupKeepAlive() {
  if (keepAliveTimer) window.clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function rejectPending(error) {
  if (!pendingTurn) return;
  window.clearTimeout(pendingTurn.timer);
  const reject = pendingTurn.reject;
  pendingTurn = null;
  reject(error instanceof Error ? error : new Error(String(error || "FUSION_AI_FAILED")));
}

function closeDeepgramSession() {
  cleanupKeepAlive();
  settingsReady = false;
  readyPromise = null;
  sessionRequestId = null;
  latestLatency = null;
  rejectPending(new Error("DEEPGRAM_DISCONNECTED"));
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "client reset");
  socket = null;
}

async function executeClientTool(fn) {
  let args = {};
  try {
    args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments || "{}") : (fn.arguments ?? {});
  } catch {
    args = {};
  }

  const { data, error } = await supabase.functions.invoke("fusion-ai-tool", {
    body: { tool: fn.name, args },
  });

  const result = error
    ? { error: error?.message || "Falha ao consultar o catálogo." }
    : (data?.result ?? { error: data?.error || "Resposta vazia do catálogo." });

  if (pendingTurn) collectGameReferences(result, pendingTurn.games, pendingTurn.actions);

  if (socket?.readyState === WebSocket.OPEN) {
    sendSocket({
      type: "FunctionCallResponse",
      id: fn.id,
      name: fn.name,
      content: JSON.stringify(result).slice(0, 36_000),
      ...(fn.thought_signature ? { thought_signature: fn.thought_signature } : {}),
    });
  }
}

async function getDeepgramToken() {
  const { data, error } = await supabase.functions.invoke("deepgram-token", { body: {} });
  if (error) {
    if (error?.context?.status === 401) throw new Error("AUTH_REQUIRED");
    if (error?.context?.status === 503) throw new Error("DEEPGRAM_NOT_CONFIGURED");
    throw new Error("DEEPGRAM_TOKEN_FAILED");
  }
  if (!data?.access_token) throw new Error(data?.code || "DEEPGRAM_TOKEN_FAILED");
  return String(data.access_token);
}

function makeSettings(history) {
  const thinkBase = {
    prompt: SYSTEM_PROMPT,
    functions: FUNCTIONS,
  };

  return {
    type: "Settings",
    tags: ["fusion", "text-chat", "mvp", "deepgram-realtime"],
    experimental: false,
    mip_opt_out: false,
    flags: { history: true },
    audio: {
      input: { encoding: "linear16", sample_rate: 16_000 },
      output: { encoding: "mulaw", sample_rate: 8_000, container: "none" },
    },
    agent: {
      context: history.length ? { messages: history } : undefined,
      think: [
        {
          ...thinkBase,
          provider: {
            type: "open_ai",
            model: PRIMARY_MODEL,
            reasoning_mode: "low",
          },
        },
        {
          ...thinkBase,
          provider: {
            type: "open_ai",
            model: "gpt-4.1-mini",
            temperature: 0.15,
          },
        },
      ],
      speak: {
        provider: {
          type: "deepgram",
          version: "v2",
          model: "flux-kit-en",
          speed: 1.5,
        },
      },
    },
  };
}

async function ensureDeepgramConnected(history = []) {
  if (settingsReady && socket?.readyState === WebSocket.OPEN) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const token = await getDeepgramToken();

    await new Promise((resolve, reject) => {
      let settingsSent = false;
      const connectionTimer = window.setTimeout(() => {
        reject(new Error("DEEPGRAM_CONNECT_TIMEOUT"));
        closeDeepgramSession();
      }, 7000);

      try {
        socket = new WebSocket(DEEPGRAM_AGENT_URL, ["bearer", token]);
      } catch (error) {
        window.clearTimeout(connectionTimer);
        reject(error);
        return;
      }

      socket.binaryType = "arraybuffer";

      socket.onmessage = async (event) => {
        if (typeof event.data !== "string") return;

        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === "Welcome") {
          sessionRequestId = message.request_id ?? message.session_id ?? null;
          if (!settingsSent) {
            settingsSent = true;
            sendSocket(makeSettings(history));
          }
          return;
        }

        if (message.type === "SettingsApplied") {
          window.clearTimeout(connectionTimer);
          settingsReady = true;
          cleanupKeepAlive();
          keepAliveTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) sendSocket({ type: "KeepAlive" });
          }, KEEPALIVE_MS);
          resolve();
          return;
        }

        if (message.type === "FunctionCallRequest") {
          const calls = (Array.isArray(message.functions) ? message.functions : []).filter((fn) => fn?.client_side !== false);
          await Promise.all(calls.map(executeClientTool));
          return;
        }

        if (message.type === "LatencyReport") {
          latestLatency = message;
          return;
        }

        if (message.type === "ConversationText" && message.role === "assistant" && pendingTurn) {
          const reply = String(message.content ?? "").trim();
          if (!reply) return;

          const completed = pendingTurn;
          pendingTurn = null;
          window.clearTimeout(completed.timer);
          completed.resolve({
            reply,
            model: PRIMARY_MODEL,
            usage: null,
            latencyMs: Math.round(performance.now() - completed.startedAt),
            latency: latestLatency,
            sessionId: sessionRequestId,
            games: [...completed.games.values()].slice(0, 20),
            actions: completed.actions.slice(0, 4),
          });
          return;
        }

        if (message.type === "Error") {
          const detail = message.description || message.message || message.code || "DEEPGRAM_AGENT_ERROR";
          rejectPending(new Error(String(detail)));
          if (!settingsReady) {
            window.clearTimeout(connectionTimer);
            reject(new Error(String(detail)));
          }
          return;
        }

        if (message.type === "InjectionRefused" && pendingTurn) {
          rejectPending(new Error("DEEPGRAM_BUSY"));
        }
      };

      socket.onerror = () => {
        if (!settingsReady) {
          window.clearTimeout(connectionTimer);
          reject(new Error("DEEPGRAM_SOCKET_ERROR"));
        }
      };

      socket.onclose = () => {
        cleanupKeepAlive();
        settingsReady = false;
        socket = null;
        readyPromise = null;
        rejectPending(new Error("DEEPGRAM_DISCONNECTED"));
      };
    });
  })();

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    settingsReady = false;
    throw error;
  }
}

export async function getFusionAIUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export function onFusionAIAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) closeDeepgramSession();
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function warmFusionAI(messages = []) {
  const history = safeHistory(messages);
  try {
    await ensureDeepgramConnected(history);
    return true;
  } catch {
    return false;
  }
}

export async function sendFusionAIMessage(messages) {
  const history = safeHistory(messages);
  const current = history.at(-1);
  if (!current || current.role !== "user") throw new Error("INVALID_CONVERSATION");

  await ensureDeepgramConnected(history.slice(0, -1));
  if (pendingTurn) throw new Error("FUSION_AI_BUSY");

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      if (!pendingTurn) return;
      pendingTurn = null;
      reject(new Error("DEEPGRAM_TURN_TIMEOUT"));
    }, TURN_TIMEOUT_MS);

    pendingTurn = {
      resolve,
      reject,
      timer,
      startedAt,
      games: new Map(),
      actions: [],
    };

    try {
      latestLatency = null;
      sendSocket({ type: "InjectUserMessage", content: current.content });
    } catch (error) {
      window.clearTimeout(timer);
      pendingTurn = null;
      reject(error);
    }
  });
}

export function resetFusionAIRealtime() {
  closeDeepgramSession();
}
