import { supabase } from "../lib/supabase.js";

export async function getFusioAIUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export function onFusioAIAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function sendFusioAIMessage(messages) {
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-16)
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, 6000),
    }));

  const { data, error } = await supabase.functions.invoke("fusio-ai", {
    body: { messages: safeMessages },
  });

  if (error) {
    if (error?.context?.status === 401) {
      throw new Error("AUTH_REQUIRED");
    }
    if (error?.context?.status === 503) {
      throw new Error("FUSIO_NOT_CONFIGURED");
    }
    throw error;
  }

  if (!data?.reply) {
    throw new Error(data?.error || "FUSIO_AI_FAILED");
  }

  return {
    reply: String(data.reply),
    model: data.model ?? null,
  };
}
