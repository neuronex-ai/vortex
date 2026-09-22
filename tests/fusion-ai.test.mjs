import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Fusion AI keeps NVIDIA credentials server-side and defaults to the fast tool-capable model", async () => {
  const edge = await read("supabase/functions/fusion-ai/index.ts");
  const client = await read("src/services/fusionAI.js");

  assert.match(edge, /Deno\.env\.get\("NVIDIA_API_KEY"\)/);
  assert.match(edge, /Deno\.env\.get\("NVIDIA_MODEL"\)/);
  assert.match(edge, /openai\/gpt-oss-20b/);
  assert.match(edge, /integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
  assert.doesNotMatch(edge, /nvapi-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(client, /NVIDIA_API_KEY|integrate\.api\.nvidia\.com/);
});

test("Fusion AI exposes catalog, provider and Nucleus tools to the agent", async () => {
  const edge = await read("supabase/functions/fusion-ai/index.ts");

  for (const tool of [
    "search_catalog",
    "get_game_details",
    "find_similar_games",
    "get_external_sources",
    "check_nucleus_support",
  ]) {
    assert.match(edge, new RegExp('name: "' + tool + '"'));
  }

  assert.match(edge, /hub\.splitscreen\.me\/api\/v1\/handlers/);
  assert.match(edge, /resolve-game-sources/);
  assert.match(edge, /search_steam_fallback_ids/);
});

test("Fusion AI shell mirrors the Synapse launcher pattern without AI branding icons", async () => {
  const shell = await read("src/components/fusion/FusionAI.jsx");
  const bootstrap = await read("src/app/bootstrap.js");

  assert.match(shell, /Fusion AI/);
  assert.match(shell, /MicIcon/);
  assert.match(shell, /ChatIcon/);
  assert.doesNotMatch(shell, /Sparkles|BrainCircuit|BotIcon|Robot/);
  assert.match(bootstrap, /mountFusionAI/);
  assert.match(shell, /Fusion AI/);
  assert.doesNotMatch(shell, /Fusio AI/);
  assert.match(bootstrap, /\["catalog", "account", "favorites"\]/);
});
