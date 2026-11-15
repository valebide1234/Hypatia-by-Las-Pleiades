import { callAssistant, type ApiMessage, type Block } from "./protocol";
import { runTool, type ToolEnv } from "./tools";

const MAX_TURNS = 8;

export interface AgentResult {
  /** The conversation to send next time, including this exchange and the model's own blocks. */
  history: ApiMessage[];
  /** The assistant's answer, as Markdown. */
  text: string;
  /** Names of the tools it used, in order. */
  tools: string[];
}

/**
 * One question to the AI assistant. The model may ask for tools; each is run here on the
 * engine's data and its result sent back, until the model answers in words.
 *
 * The model's reply is kept exactly as received (thinking blocks included) and returned in the
 * same position on the next request, as the Messages API requires. All the results of one turn
 * go back in a single user message.
 */
export async function runAgent(history: ApiMessage[], userMessage: string, env: ToolEnv, onTool?: (name: string) => void, signal?: AbortSignal): Promise<AgentResult> {
  const messages: ApiMessage[] = [...history, { role: "user", content: userMessage }];
  const tools: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await callAssistant(messages, signal);
    messages.push({ role: "assistant", content: reply.content });
    const text = reply.content
      .filter((b): b is Block & { text: string } => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (reply.stop_reason === "refusal") return { history: messages, text: text || "The model declined to answer that.", tools };
    const calls = reply.content.filter((b): b is Block & { id: string; name: string } => b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string");
    if (reply.stop_reason !== "tool_use" || calls.length === 0) return { history: messages, text, tools };

    const results: Block[] = [];
    for (const call of calls) {
      onTool?.(call.name);
      tools.push(call.name);
      const { result, isError } = await runTool(call.name, call.input, env);
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result), ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { history: messages, text: "I could not finish that in a reasonable number of steps. Try asking for one thing at a time.", tools };
}
