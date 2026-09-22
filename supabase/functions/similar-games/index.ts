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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await request.text();
    if (raw.length > 5000) return json({ error: "Payload too large" }, 413);
    const body = JSON.parse(raw || "{}");
    const steamAppId = Number(body?.steamAppId);
    const count = Math.min(30, Math.max(1, Math.floor(Number(body?.count) || 24)));

    if (!Number.isSafeInteger(steamAppId) || steamAppId <= 0) {
      return json({ error: "Invalid Steam App ID" }, 400);
    }

    const { data, error } = await admin.rpc("steam_more_like_this_ids", {
      p_app_id: steamAppId,
      p_count: count,
    });

    if (error) throw error;
    return json({
      steamAppId,
      ids: (Array.isArray(data) ? data : []).map(Number).filter(Number.isSafeInteger),
    });
  } catch (error) {
    console.error("similar-games", error);
    return json({ error: "Não foi possível consultar jogos similares agora." }, 502);
  }
});
