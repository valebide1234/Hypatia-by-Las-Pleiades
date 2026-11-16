/** Conversation with the assistant's server (the dev proxy or the Supabase function). */

export interface Block {
  type: string;
  [key: string]: unknown;
}
export interface ApiMessage {
  role: "user" | "assistant";
  content: string | Block[];
}
export interface ProxyReply {
  content: Block[];
  stop_reason: string | null;
  model?: string;
}

/** The AI is not set up on this copy (no key, no function) or cannot be reached: use the built-in answers. */
export class AssistantUnavailable extends Error {}

/**
 * Where the assistant is served. While developing, the dev server answers at /api/assistant
 * (see vite.config.ts). A published app needs VITE_ASSISTANT_URL; without it there is no AI.
 */
export const ASSISTANT_URL: string | null = import.meta.env.VITE_ASSISTANT_URL || (import.meta.env.DEV ? `${import.meta.env.BASE_URL}api/assistant` : null);

export async function callAssistant(messages: ApiMessage[], signal?: AbortSignal): Promise<ProxyReply> {
  if (!ASSISTANT_URL) throw new AssistantUnavailable("not_configured");
  // Supabase Edge Functions check the project's anon key, which is public by design.
  const anon: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || undefined;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(anon ? { Authorization: `Bearer ${anon}`, apikey: anon } : {}) };
  let res: Response;
  try {
    res = await fetch(ASSISTANT_URL, { method: "POST", headers, body: JSON.stringify({ messages }), signal });
  } catch {
    throw new AssistantUnavailable("unreachable");
  }
  if (res.status === 503 || res.status === 404) throw new AssistantUnavailable("not_configured");
  const body = (await res.json().catch(() => null)) as (ProxyReply & { error?: string }) | null;
  if (!res.ok || !body || !Array.isArray(body.content)) throw new Error(body?.error ?? `The assistant answered with an error (HTTP ${res.status}).`);
  return body;
}
