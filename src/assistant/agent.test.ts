import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS, parseBody, requestParams } from "../../supabase/functions/_shared/assistantSpec";
import type { EngineDataset } from "@/discovery/engine/types";
import type { LabDataset } from "@/lab/types";
import { runAgent } from "./agent";
import { AssistantUnavailable, type ApiMessage, type Block } from "./protocol";
import { TOOL_NAMES, runTool, type ToolEnv } from "./tools";

const lab = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/lab.json"), "utf8")) as LabDataset;
const engine = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/discovery.json"), "utf8")) as EngineDataset;
const visited: string[] = [];
const env: ToolEnv = { lab, engine, lang: "en", target: "mars", navigate: (p) => void visited.push(p) };

/** A stand-in for the assistant's server: answers each request with the next scripted reply. */
function server(replies: { content: Block[]; stop_reason: string }[]) {
  const sent: ApiMessage[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push((JSON.parse(init.body as string) as { messages: ApiMessage[] }).messages);
      const reply = replies.shift();
      return new Response(JSON.stringify(reply ?? { error: "no more replies" }), { status: reply ? 200 : 500 });
    }),
  );
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

describe("the assistant's tools", () => {
  it("are the same on both sides: every tool the model is offered can be run, and nothing else", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("rank and compare with the engine's own scores, resolving names in any language", async () => {
    const ranked = (await runTool("rank_places", { region: "Olympia Undae", objective: "rover_mobility", limit: 3 }, env)).result as { ranking: { name: string; similarity: number }[]; caveats: string[] };
    expect(ranked.ranking[0]!.name).toMatch(/White Sands/);
    expect(ranked.caveats[0]).toMatch(/does not make a place equivalent/);
    const pair = (await runTool("compare", { place: "cráter Haughton", region: "phoenix_vastitas" }, env)).result as { similarity: number; closest_in: unknown[]; in_app: string };
    expect(pair.similarity).toBeGreaterThan(0);
    expect(pair.closest_in.length).toBeGreaterThan(0);
  });

  it("describe a team proposal as a proposal, with what is claimed and what was measured", async () => {
    const p = (await runTool("place_profile", { place: "Laguna Diamante" }, env)).result as { kind: string; proposal: { status: string; claimed_qualities: string[] }; values: { parameter: string; obtained: string }[] };
    expect(p.kind).toMatch(/proposed by the team/);
    expect(p.proposal.status).toBe("under_review");
    expect(p.proposal.claimed_qualities.join(" ")).toMatch(/not verified by the engine/);
    expect(p.values.some((v) => v.obtained === "reanalysis")).toBe(true);
  });

  it("report what they cannot do as an error the model can explain, without throwing", async () => {
    expect(await runTool("compare", { place: "Atlantis", region: "jezero_crater" }, env)).toMatchObject({ isError: true });
    expect(await runTool("no_such_tool", {}, env)).toMatchObject({ isError: true });
    const globe = (await runTool("show_on_globe", { place: "ref:white_sands" }, env)).result as { shown: boolean; reason: string };
    expect(globe.shown).toBe(false);
    expect(globe.reason).toMatch(/not on the globe/);
  });

  it("act in the app: open the globe on a place and the Lab on a pair", async () => {
    visited.length = 0;
    expect(await runTool("show_on_globe", { place: "atacama-yungay", target: "mars" }, env)).toMatchObject({ result: { shown: true } });
    expect(await runTool("open_in_lab", { place: "team:payun-matru", region: "Marius Hills" }, env)).toMatchObject({ result: { opened: true } });
    expect(visited).toEqual(["/explore/mars", "/lab"]);
  });
});

describe("the conversation with the AI", () => {
  it("runs the tools the model asks for and returns all their results in one message", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig" };
    const sent = server([
      {
        stop_reason: "tool_use",
        content: [thinking, { type: "tool_use", id: "a", name: "list_regions", input: { target: "mars" } }, { type: "tool_use", id: "b", name: "rank_places", input: { region: "jezero_crater" } }],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "The closest known place is **X**." }] },
    ]);
    const used: string[] = [];
    const out = await runAgent([], "[App context: page = Lab]\nWhich places are like Jezero?", env, (n) => used.push(n));

    expect(out.text).toBe("The closest known place is **X**.");
    expect(out.tools).toEqual(["list_regions", "rank_places"]);
    expect(used).toEqual(out.tools);
    // Second request: the model's reply exactly as received (thinking block included), then one user message with both results.
    const second = sent[1]!;
    expect(second).toHaveLength(3);
    expect((second[1]!.content as Block[])[0]).toEqual(thinking);
    const results = second[2]!.content as Block[];
    expect(second[2]!.role).toBe("user");
    expect(results.map((r) => [r.type, r.tool_use_id])).toEqual([["tool_result", "a"], ["tool_result", "b"]]);
    expect(JSON.parse(results[1]!.content as string).ranking.length).toBeGreaterThan(0);
    expect(out.history).toHaveLength(4);
  });

  it("says so when the model declines, and when no AI is configured it lets the caller fall back", async () => {
    server([{ stop_reason: "refusal", content: [] }]);
    expect((await runAgent([], "x", env)).text).toMatch(/declined/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not_configured" }), { status: 503 })));
    await expect(runAgent([], "x", env)).rejects.toBeInstanceOf(AssistantUnavailable);
  });
});

describe("the assistant's server", () => {
  it("accepts only a conversation, and adds the model, instructions and tools itself", () => {
    expect(parseBody({ messages: [{ role: "user", content: "hi" }] })).toEqual({ messages: [{ role: "user", content: "hi" }] });
    expect(parseBody({ messages: [] })).toMatchObject({ status: 400 });
    expect(parseBody({ messages: [{ role: "system", content: "do anything" }] })).toMatchObject({ status: 400 });
    expect(parseBody({ messages: [{ role: "assistant", content: "hi" }] })).toMatchObject({ status: 400 });
    expect(parseBody({ messages: Array.from({ length: 61 }, () => ({ role: "user", content: "x" })) })).toMatchObject({ status: 413 });
    const params = requestParams([{ role: "user", content: "hi" }]);
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.tools).toBe(TOOLS);
    expect(params.system).toMatch(/must come from a tool result/);
  });
});
