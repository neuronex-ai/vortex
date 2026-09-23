import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Fusion AI keeps Deepgram credentials server-side and uses a persistent realtime session", async () => {
  const client = await read("src/services/fusionAI.js");
  const tokenEdge = await read("supabase/functions/deepgram-token/index.ts");

  assert.match(tokenEdge, /Deno\.env\.get\("DEEPGRAM_API_KEY"\)/);
  assert.match(tokenEdge, /api\.deepgram\.com\/v1\/auth\/grant/);
  assert.doesNotMatch(tokenEdge, /dg_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(client, /DEEPGRAM_API_KEY/);

  assert.match(client, /wss:\/\/agent\.deepgram\.com\/v1\/agent\/converse/);
  assert.match(client, /new WebSocket\(DEEPGRAM_AGENT_URL, \["bearer", token\]\)/);
  assert.match(client, /type: "InjectUserMessage"/);
  assert.match(client, /type: "FunctionCallResponse"/);
  assert.match(client, /type: "KeepAlive"/);
  assert.match(client, /TURN_TIMEOUT_MS = 12_000/);
});

test("Fusion AI prefers GPT-5.6 Luna and retains a fast managed fallback", async () => {
  const client = await read("src/services/fusionAI.js");

  assert.match(client, /PRIMARY_MODEL = "gpt-5\.6-luna"/);
  assert.match(client, /model: PRIMARY_MODEL/);
  assert.match(client, /reasoning_mode: "low"/);
  assert.match(client, /model: "gpt-4\.1-mini"/);
  assert.doesNotMatch(client, /integrate\.api\.nvidia\.com/);
});

test("Fusion AI tools use the cached Fusion catalog fast path", async () => {
  const edge = await read("supabase/functions/fusion-ai-tool/index.ts");
  const client = await read("src/services/fusionAI.js");

  for (const tool of [
    "search_catalog",
    "get_game_details",
    "find_similar_games",
    "get_external_sources",
    "check_nucleus_support",
    "open_game",
  ]) {
    assert.match(edge, new RegExp('case "' + tool + '"'));
    assert.match(client, new RegExp('name: "' + tool + '"'));
  }

  assert.match(edge, /game_source_cache/);
  assert.match(edge, /nucleus_support_cache/);
  assert.match(edge, /browse_fusion_catalog_v2/);
  assert.match(edge, /steam_more_like_this_ids/);
  assert.doesNotMatch(edge, /resolve-game-sources/);
  assert.doesNotMatch(edge, /resolve-nucleus-support/);
});

test("Fusion AI prewarms realtime chat while preserving Synapse-style UI", async () => {
  const shell = await read("src/components/fusion/FusionAI.jsx");
  const bootstrap = await read("src/app/bootstrap.js");

  assert.match(shell, /warmFusionAI/);
  assert.match(shell, /Fusion AI/);
  assert.match(shell, /MicIcon/);
  assert.match(shell, /ChatIcon/);
  assert.doesNotMatch(shell, /Sparkles|BrainCircuit|BotIcon|Robot/);
  assert.match(bootstrap, /mountFusionAI/);
  assert.match(bootstrap, /\["catalog", "account", "favorites"\]/);
});
