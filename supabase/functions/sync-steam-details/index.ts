import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type SyncBody = {
  limit?: number;
  appIds?: number[];
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

  const body = (await request.json().catch(() => ({}))) as SyncBody;
  const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 50);

  let appIds = Array.isArray(body.appIds)
    ? body.appIds
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
        .slice(0, 50)
    : [];

  if (!appIds.length) {
    const { data, error } = await admin.rpc("pending_steam_app_ids", {
      p_limit: limit,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    appIds = Array.isArray(data) ? data.map(Number) : [];
  }

  if (!appIds.length) {
    return Response.json({
      ok: true,
      requested: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      message: "No Steam apps are pending detail synchronization",
    });
  }

  const { data, error } = await admin.rpc("sync_steam_apps", {
    p_app_ids: appIds,
  });

  if (error) {
    for (const appId of appIds) {
      await admin.rpc("mark_steam_sync_failure", {
        p_app_id: appId,
        p_error: error.message,
      });
    }

    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: enrichment, error: enrichmentError } = await admin.rpc("enrich_steam_store_metadata", {
    p_app_ids: appIds,
  });

  return Response.json({
    ...(data ?? {}),
    enrichment: enrichmentError
      ? { ok: false, error: enrichmentError.message }
      : enrichment,
  });
});
