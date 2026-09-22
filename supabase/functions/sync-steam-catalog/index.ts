import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type SyncBody = {
  appIds?: number[];
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const configuredSecret = Deno.env.get("FUSION_SYNC_SECRET");
  const suppliedSecret = request.headers.get("x-fusion-sync-secret");

  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as SyncBody;
  const appIds = Array.isArray(body.appIds)
    ? body.appIds.filter((value) => Number.isInteger(value) && value > 0)
    : [];

  if (!appIds.length) {
    return Response.json(
      { error: "appIds must contain at least one Steam App ID" },
      { status: 400 },
    );
  }

  if (appIds.length > 50) {
    return Response.json(
      { error: "A maximum of 50 App IDs is allowed per sync" },
      { status: 400 },
    );
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

  const { data, error } = await admin.rpc("sync_steam_apps", {
    p_app_ids: appIds,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
});
