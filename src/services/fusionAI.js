import { supabase } from "../lib/supabase.js";

export async function getFusionAIUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export function onFusionAIAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function sendFusionAIMessage(messages) {
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-16)
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, 6000),
    }));

  const { data, error } = await supabase.functions.invoke("fusion-ai", {
    body: { messages: safeMessages },
  });

  if (error) {
    if (error?.context?.status === 401) {
      throw new Error("AUTH_REQUIRED");
    }
    if (error?.context?.status === 503) {
      throw new Error("FUSION_NOT_CONFIGURED");
    }
    throw error;
  }

  if (!data?.reply) {
    throw new Error(data?.error || "FUSION_AI_FAILED");
  }

  return {
    reply: String(data.reply),
    model: data.model ?? null,
    usage: data.usage ?? null,
    latencyMs: Number(data.latencyMs ?? 0) || null,
    games: Array.isArray(data.games) ? data.games : [],
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}
