// Supabase Edge Function: the Hypatia assistant for the published app.
//
// The browser sends the conversation; this function adds the model, the instructions and the
// tool definitions (supabase/functions/_shared/assistantSpec.ts), calls Claude and returns its
// reply. Tools run in the browser, on the engine's data, so no data pass through here except
// the conversation itself.
//
// Deploy:   supabase functions deploy assistant
// Secret:   supabase secrets set ANTHROPIC_API_KEY=...        (never put this key in the app)
// App:      VITE_ASSISTANT_URL=https://<project-ref>.supabase.co/functions/v1/assistant
//
// The function keeps Supabase's default JWT check, so only requests carrying the project's
// anon key (which the app sends) are accepted. Every call spends API credit: watch usage.
import Anthropic from "npm:@anthropic-ai/sdk";
import { MAX_BODY_BYTES, parseBody, requestParams } from "../_shared/assistantSpec.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "The conversation is too long. Start a new one." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "The request body must be JSON." }, 400);
  }
  const parsed = parseBody(body);
  if ("error" in parsed) return json({ error: parsed.error }, parsed.status);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "not_configured" }, 503);
  const client = new Anthropic({ apiKey });

  try {
    // deno-lint-ignore no-explicit-any
    const response = await client.beta.messages.create(requestParams(parsed.messages) as any);
    return json({ content: response.content, stop_reason: response.stop_reason, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: "The assistant is busy. Try again in a moment." }, 429);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: "not_configured" }, 503);
    if (error instanceof Anthropic.APIError) return json({ error: `The model request failed (${error.status ?? "no status"}).` }, 502);
    return json({ error: "The assistant could not be reached." }, 502);
  }
});
