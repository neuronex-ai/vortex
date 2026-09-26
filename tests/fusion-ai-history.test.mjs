import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Fusion AI persists conversations through the authenticated Supabase client", async () => {
  const history = await read("src/services/fusionAIHistory.js");

  assert.match(history, /from\("fusion_ai_conversations"\)/);
  assert.match(history, /from\("fusion_ai_messages"\)/);
  assert.match(history, /supabase\.auth\.getUser\(\)/);
  assert.match(history, /\.eq\("user_id", user\.id\)/);
  assert.match(history, /createFusionAIConversation/);
  assert.match(history, /loadFusionAIConversation/);
  assert.match(history, /appendFusionAIMessage/);
});

test("Fusion AI restores the newest persisted messages in chronological display order", async () => {
  const history = await read("src/services/fusionAIHistory.js");

  assert.match(history, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(history, /messages: \[\.\.\.\(messagesResult\.data \?\? \[\]\)\]\.reverse\(\)/);
});

test("Fusion AI restores recent history without putting persistence on the response critical path", async () => {
  const shell = await read("src/components/fusion/FusionAI.jsx");

  assert.match(shell, /listFusionAIConversations\(\{ limit: 1 \}\)/);
  assert.match(shell, /loadFusionAIConversation\(latest\.id/);
  assert.match(shell, /const conversationPromise = ensureConversation\(\)\.catch\(\(\) => null\)/);
  assert.match(shell, /const userPersistence = conversationPromise\.then/);
  assert.match(shell, /const result = await sendFusionAIMessage\(history\)/);
  assert.match(shell, /void userPersistence\.then/);
});

test("Fusion AI closes Deepgram realtime sessions after inactivity or panel close", async () => {
  const shell = await read("src/components/fusion/FusionAI.jsx");

  assert.match(shell, /REALTIME_IDLE_MS = 30_000/);
  assert.match(shell, /resetFusionAIRealtime\(\)/);
  assert.match(shell, /window\.setTimeout\(\(\) => \{\s*resetFusionAIRealtime\(\);\s*\}, REALTIME_IDLE_MS\)/s);
  assert.match(shell, /if \(open\) return undefined;\s*resetFusionAIRealtime\(\);/s);
});

test("Fusion AI new-chat action preserves stored history and starts a fresh conversation", async () => {
  const shell = await read("src/components/fusion/FusionAI.jsx");

  assert.match(shell, /conversationIdRef\.current = null/);
  assert.match(shell, /setConversationId\(null\)/);
  assert.match(shell, /setMessages\(\[\]\)/);
  assert.doesNotMatch(shell, /deleteFusionAIConversation/);
});
