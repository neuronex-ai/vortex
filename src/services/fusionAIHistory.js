import { supabase } from "../lib/supabase.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 80;
const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);

const CONVERSATION_FIELDS = [
  "id",
  "title",
  "model",
  "created_at",
  "updated_at",
  "last_message_at",
].join(",");

const MESSAGE_FIELDS = [
  "id",
  "conversation_id",
  "role",
  "content",
  "model",
  "latency_ms",
  "metadata",
  "created_at",
].join(",");

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, 160) : null;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return data.user;
}

export async function createFusionAIConversation({ title = null, model = DEFAULT_MODEL } = {}) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("fusion_ai_conversations")
    .insert({
      user_id: user.id,
      title: normalizeTitle(title),
      model: String(model || DEFAULT_MODEL).slice(0, 80),
    })
    .select(CONVERSATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function listFusionAIConversations({ limit = 20 } = {}) {
  const user = await requireUser();
  const safeLimit = clampInteger(limit, 20, 1, MAX_CONVERSATIONS);

  const { data, error } = await supabase
    .from("fusion_ai_conversations")
    .select(CONVERSATION_FIELDS)
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data ?? [];
}

export async function loadFusionAIConversation(conversationId, { messageLimit = MAX_MESSAGES } = {}) {
  const user = await requireUser();
  const id = String(conversationId || "").trim();
  if (!id) throw new Error("INVALID_CONVERSATION_ID");

  const safeLimit = clampInteger(messageLimit, MAX_MESSAGES, 1, MAX_MESSAGES);
  const [conversationResult, messagesResult] = await Promise.all([
    supabase
      .from("fusion_ai_conversations")
      .select(CONVERSATION_FIELDS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fusion_ai_messages")
      .select(MESSAGE_FIELDS)
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(safeLimit),
  ]);

  if (conversationResult.error) throw conversationResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (!conversationResult.data) return null;

  return {
    conversation: conversationResult.data,
    messages: messagesResult.data ?? [],
  };
}

export async function appendFusionAIMessage({
  conversationId,
  role,
  content,
  model = null,
  latencyMs = null,
  metadata = {},
}) {
  const user = await requireUser();
  const id = String(conversationId || "").trim();
  const safeRole = String(role || "").trim();
  const safeContent = String(content ?? "").trim();

  if (!id) throw new Error("INVALID_CONVERSATION_ID");
  if (!VALID_ROLES.has(safeRole)) throw new Error("INVALID_MESSAGE_ROLE");
  if (!safeContent || safeContent.length > 50_000) throw new Error("INVALID_MESSAGE_CONTENT");

  const safeLatency = latencyMs == null
    ? null
    : clampInteger(latencyMs, 0, 0, 2_147_483_647);

  const { data, error } = await supabase
    .from("fusion_ai_messages")
    .insert({
      conversation_id: id,
      user_id: user.id,
      role: safeRole,
      content: safeContent,
      model: model ? String(model).slice(0, 80) : null,
      latency_ms: safeLatency,
      metadata: normalizeMetadata(metadata),
    })
    .select(MESSAGE_FIELDS)
    .single();

  if (error) throw error;

  const now = new Date().toISOString();
  const titleCandidate = safeRole === "user" ? normalizeTitle(safeContent.slice(0, 72)) : null;

  let update = {
    updated_at: now,
    last_message_at: now,
  };

  if (titleCandidate) {
    const { data: conversation, error: conversationError } = await supabase
      .from("fusion_ai_conversations")
      .select("title")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation?.title) update = { ...update, title: titleCandidate };
  }

  const { error: touchError } = await supabase
    .from("fusion_ai_conversations")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (touchError) throw touchError;
  return data;
}

export async function renameFusionAIConversation(conversationId, title) {
  const user = await requireUser();
  const id = String(conversationId || "").trim();
  if (!id) throw new Error("INVALID_CONVERSATION_ID");

  const { data, error } = await supabase
    .from("fusion_ai_conversations")
    .update({ title: normalizeTitle(title), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(CONVERSATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFusionAIConversation(conversationId) {
  const user = await requireUser();
  const id = String(conversationId || "").trim();
  if (!id) throw new Error("INVALID_CONVERSATION_ID");

  const { error } = await supabase
    .from("fusion_ai_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  return true;
}
