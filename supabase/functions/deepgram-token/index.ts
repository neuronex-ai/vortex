const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!DEEPGRAM_API_KEY) {
    return json({ error: "Deepgram não configurado.", code: "deepgram_not_configured" }, 503);
  }

  try {
    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
      signal: AbortSignal.timeout(5000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      console.error("deepgram-token grant failed", response.status, payload);
      return json({
        error: "Não foi possível iniciar a sessão do Fusion AI.",
        code: "deepgram_token_failed",
      }, 502);
    }

    return json({
      access_token: payload.access_token,
      expires_in: Number(payload.expires_in ?? 60),
    });
  } catch (error) {
    console.error("deepgram-token error", error);
    return json({
      error: "Não foi possível iniciar a sessão do Fusion AI.",
      code: "deepgram_token_failed",
    }, 502);
  }
});
