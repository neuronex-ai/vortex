import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DiscoverBody = {
  lastAppId?: number;
  maxResults?: number;
  ifModifiedSince?: number;
};

function getJwtRole(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    return JSON.parse(atob(payload))?.role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (getJwtRole(request) !== "service_role") {
    return new Response("Forbidden", { status: 403 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase server credentials are unavailable" },
      { status: 500 },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const body = (await request.json().catch(() => ({}))) as DiscoverBody;
  const maxResults = Math.min(
    Math.max(Number(body.maxResults ?? 1000), 1),
    5000,
  );
  const lastAppId = Math.max(Number(body.lastAppId ?? 0), 0);
  const ifModifiedSince =
    body.ifModifiedSince == null
      ? undefined
      : Math.max(Number(body.ifModifiedSince), 0);

  const { data: steamKey, error: keyError } = await admin.rpc(
    "get_steam_web_api_key",
  );

  if (keyError || !steamKey) {
    return Response.json(
      {
        error:
          "Steam Web API key is not configured in Supabase Vault as steam_web_api_key",
      },
      { status: 503 },
    );
  }

  const input: Record<string, unknown> = {
    include_games: true,
    include_dlc: false,
    include_software: false,
    include_videos: false,
    include_hardware: false,
    max_results: maxResults,
  };

  if (lastAppId > 0) input.last_appid = lastAppId;
  if (ifModifiedSince != null) input.if_modified_since = ifModifiedSince;

  const url = new URL(
    "https://partner.steam-api.com/IStoreService/GetAppList/v1/",
  );
  url.searchParams.set("key", steamKey);
  url.searchParams.set("input_json", JSON.stringify(input));

  const steamResponse = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Fusion-Game-Catalog/1.0",
    },
  });

  if (!steamResponse.ok) {
    return Response.json(
      {
        error: "Steam GetAppList request failed",
        status: steamResponse.status,
      },
      { status: 502 },
    );
  }

  const payload = await steamResponse.json();
  const response = payload?.response ?? {};
  const apps = Array.isArray(response.apps) ? response.apps : [];

  if (apps.length) {
    const now = new Date().toISOString();
    const rows = apps
      .map((app: Record<string, unknown>) => ({
        steam_app_id: Number(app.appid),
        name: String(app.name ?? "").trim() || `Steam App ${app.appid}`,
        last_modified:
          app.last_modified == null ? null : Number(app.last_modified),
        price_change_number:
          app.price_change_number == null
            ? null
            : Number(app.price_change_number),
        last_seen_at: now,
        is_active: true,
      }))
      .filter((app: { steam_app_id: number }) =>
        Number.isInteger(app.steam_app_id) && app.steam_app_id > 0
      );

    const { error: upsertError } = await admin
      .from("steam_catalog_apps")
      .upsert(rows, { onConflict: "steam_app_id" });

    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 500 });
    }
  }

  const nextLastAppId = apps.length
    ? Number(apps[apps.length - 1]?.appid ?? lastAppId)
    : lastAppId;

  const hasMore =
    typeof response.have_more_results === "boolean"
      ? response.have_more_results
      : apps.length >= maxResults;

  await admin
    .from("steam_discovery_state")
    .update({
      last_appid: hasMore ? nextLastAppId : 0,
      last_discovery_at: new Date().toISOString(),
      full_scan_completed_at: hasMore ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "catalog");

  return Response.json({
    discovered: apps.length,
    nextLastAppId,
    hasMore,
    maxResults,
  });
});
