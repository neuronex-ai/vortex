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

async function resolveOne(steamAppId: number, title: string) {
  const { data: cached } = await admin
    .from("nucleus_support_cache")
    .select("*")
    .eq("steam_app_id", steamAppId)
    .maybeSingle();

  if (cached?.checked_at && Date.parse(cached.checked_at) > Date.now() - 7 * 86400000) {
    return {
      steamAppId,
      title,
      supported: Boolean(cached.supported),
      verified: Boolean(cached.verified),
      maxPlayers: cached.max_players ?? null,
      handlerCount: Number(cached.handler_count ?? 0),
      handlers: Array.isArray(cached.details) ? cached.details : [],
      cache: "hit",
    };
  }

  let handlers: any[] = [];
  try {
    const response = await fetch(
      `https://hub.splitscreen.me/api/v1/handlers/${encodeURIComponent(title.slice(0, 120))}`,
      {
        signal: AbortSignal.timeout(7000),
        headers: { Accept: "application/json" },
      },
    );

    if (response.ok) {
      const payload = await response.json();
      const target = normalizeTitle(title);
      const rows = Array.isArray(payload?.Handlers) ? payload.Handlers : [];
      handlers = rows
        .filter((item: any) => {
          const name = item?.gameName ?? item?.title ?? "";
          return normalizeTitle(name) === target
            && item?.private !== true
            && item?.publicAuthorized !== false;
        })
        .slice(0, 6)
        .map((item: any) => ({
          id: item._id ?? item.id ?? null,
          title: item.gameName ?? item.title ?? title,
          verified: item.verified === true,
          maxPlayers: Number(item.maxPlayers ?? 0) || null,
          oneMonitor: Number(item.maxPlayersOneMonitor ?? 0) || null,
          controllers: item.playableControllers !== false,
          mouseKeyboard: item.playableMouseKeyboard === true,
          description: item.description ?? null,
          updatedAt: item.updatedAt ?? null,
        }));
    }
  } catch {
    if (cached) {
      return {
        steamAppId,
        title,
        supported: Boolean(cached.supported),
        verified: Boolean(cached.verified),
        maxPlayers: cached.max_players ?? null,
        handlerCount: Number(cached.handler_count ?? 0),
        handlers: Array.isArray(cached.details) ? cached.details : [],
        cache: "stale",
      };
    }
  }

  const supported = handlers.length > 0;
  const verified = handlers.some((handler) => handler.verified);
  const maxPlayers = handlers.reduce((max, handler) => Math.max(max, Number(handler.maxPlayers ?? 0)), 0) || null;

  await admin
    .from("nucleus_support_cache")
    .upsert({
      steam_app_id: steamAppId,
      title,
      supported,
      verified,
      max_players: maxPlayers,
      handler_count: handlers.length,
      details: handlers,
      checked_at: new Date().toISOString(),
    });

  return {
    steamAppId,
    title,
    supported,
    verified,
    maxPlayers,
    handlerCount: handlers.length,
    handlers,
    cache: "fresh",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await request.text();
    if (raw.length > 30000) return json({ error: "Payload too large" }, 413);
    const body = JSON.parse(raw || "{}");
    const games = (Array.isArray(body?.games) ? body.games : [])
      .map((game: any) => ({
        steamAppId: Number(game?.steamAppId),
        title: String(game?.title ?? "").trim(),
      }))
      .filter((game: any) => Number.isSafeInteger(game.steamAppId) && game.steamAppId > 0 && game.title)
      .slice(0, 20);

    if (!games.length) return json({ results: [] });

    const results = [];
    for (const game of games) {
      results.push(await resolveOne(game.steamAppId, game.title));
    }

    return json({ results });
  } catch (error) {
    console.error("resolve-nucleus-support", error);
    return json({ error: "Não foi possível verificar o Nucleus agora." }, 502);
  }
});
