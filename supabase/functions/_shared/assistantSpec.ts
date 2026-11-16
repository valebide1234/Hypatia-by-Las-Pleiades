// What the Hypatia assistant is, shared by the two places that can serve it: the Supabase Edge
// Function (supabase/functions/assistant) and the local development server (vite.config.ts).
// It has no imports, so both Deno and Node can load it.
//
// The model, the instructions and the tools live here, on the server side. The browser only
// sends the conversation, so the endpoint cannot be used as a general-purpose model proxy.
// The tools run in the browser, where the engine's data are: the model asks for a tool, the app
// runs it on NASA-derived data and sends the result back.

export const MODEL = "claude-opus-5-5";
export const MAX_MESSAGES = 60;
export const MAX_BODY_BYTES = 400_000;

const OBJECTIVES = ["balanced", "planetary_geology", "regolith_soil", "rover_mobility", "instrument_testing", "habitat_infrastructure", "extreme_survival", "water_ice_detection", "astrobiology"];
const MEASURABLE = ["hyperarid", "extreme_cold", "permafrost_ground_ice", "high_altitude_low_pressure", "high_uv", "rover_eva_traversal"];
const TARGET = { type: "string", enum: ["moon", "mars"] };
const OBJECTIVE = { type: "string", enum: OBJECTIVES, description: "Kind of test the comparison is for. Default: balanced." };

export const SYSTEM = `You are the assistant of Hypatia, an app made by Las Pléyades that finds places on Earth that can stand in for the Moon and Mars, so that experiments, hardware and crews can be tested here before a mission such as Artemis or a Mars mission flies.

Hypatia has a discovery engine. It describes Earth with NASA data (NASA POWER: MERRA-2 reanalysis and CERES satellite products; Copernicus DEM terrain) and compares it with specific regions of the Moon and Mars (LOLA, MOLA, Diviner, Mars Climate Database, TES). You reach all of it through tools, which run inside the app.

How to work:
- Get facts from tools. Every number, place name, ranking or source you state must come from a tool result in this conversation. If no tool can answer, say so; do not fill the gap from memory.
- When the user asks for something to be done (add a place, show it on the globe, open a comparison in the Lab, find new places), call the tool that does it, then say what happened.
- Tool results carry caveats (for example that a similarity score ranks places and does not make one equivalent to the Moon or Mars, that geology was not assessed, or that terrain was not retrieved). Keep the ones that matter for the answer.
- Say how a value was obtained when it matters: measured, reanalysis, modelled, derived, inferred, or claimed by a proposal or a study.
- Each user message starts with a line in square brackets describing what the user is looking at in the app. Use it to resolve "this place", "this region" or "here". It is context, not a request.
- Answer in the language of the user's message. Be brief and concrete: a short paragraph or a short list. Markdown bold and bullet lists are fine; no headings, no tables.
- You are not a source of medical, legal or safety advice, and you do not speak for NASA or any agency.`;

export const TOOLS = [
  {
    name: "list_regions",
    description: "Lists the lunar and Martian mission regions the engine compares Earth with (the Artemis south-pole region, Apollo sites, Jezero, Gale and others), with their ids. Call it to find a region's id or to tell the user which regions exist.",
    input_schema: { type: "object", properties: { target: { ...TARGET, description: "Limit the list to one body." } }, additionalProperties: false },
  },
  {
    name: "search_places",
    description: "Finds Earth places the app knows by name: catalogued analog sites, places proposed by the team, engine reference sites, and places the user added. With no query it returns all of them. Use it to resolve a name before another tool, or to list what exists.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Part of a place name, in any language." } }, additionalProperties: false },
  },
  {
    name: "rank_places",
    description: "Ranks the known Earth places by similarity to one mission region, for one kind of test. Returns the best matches with their scores and confidence. Use it for questions like 'which places are most like Jezero for rover mobility?'.",
    input_schema: {
      type: "object",
      properties: { region: { type: "string", description: "Region id or name." }, objective: OBJECTIVE, limit: { type: "integer", minimum: 1, maximum: 15, description: "How many places to return. Default 5." } },
      required: ["region"],
      additionalProperties: false,
    },
  },
  {
    name: "compare",
    description: "Compares one Earth place with one mission region: overall similarity, confidence, the score of each category, what brings them together and what sets them apart. It also selects the pair in the Lab so the user can open it there.",
    input_schema: {
      type: "object",
      properties: { place: { type: "string", description: "Place id or name." }, region: { type: "string", description: "Region id or name." }, objective: OBJECTIVE },
      required: ["place", "region"],
      additionalProperties: false,
    },
  },
  {
    name: "place_profile",
    description: "Everything the engine knows about one Earth place: its retrieved values with how each was obtained, its environment type and rarity from the machine-learning model, the mission regions it resembles most, and what the catalogue, the team's proposal or the engine say about it.",
    input_schema: { type: "object", properties: { place: { type: "string", description: "Place id or name." }, target: { ...TARGET, description: "Body to rank regions for. Default: the one the user is exploring." } }, required: ["place"], additionalProperties: false },
  },
  {
    name: "discover_new_places",
    description: "Runs the discovery engine: finds places on Earth that are NOT in any analog catalogue and whose NASA data support the requested qualities and/or resemble a mission region. The results are put on the globe as amber candidate pins. Use it when the user wants new or undiscovered analogs.",
    input_schema: {
      type: "object",
      properties: {
        target: TARGET,
        qualities: { type: "array", items: { type: "string", enum: MEASURABLE }, description: "Qualities the new place must have. Only these can be measured from data; geology cannot." },
        region: { type: "string", description: "Mission region id or name to resemble (optional)." },
        prefer_new_data: { type: "boolean", description: "Put first the places whose match is strengthened by the newest months of NASA data." },
      },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "add_place",
    description: "Adds a place the user names, from live data: looks the name up (or takes 'latitude, longitude'), requests its climate from NASA POWER, and adds it to the app so it can be compared with any region. Use it when the user asks to add, include or analyse a place the app does not have.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Place name, or coordinates as 'lat, lon' in decimal degrees." } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "show_on_globe",
    description: "Opens the globe and selects a place on it, so the user sees its pin and its panel. Engine reference sites are not on the globe; the result says so.",
    input_schema: { type: "object", properties: { place: { type: "string", description: "Place id or name." }, target: TARGET }, required: ["place"], additionalProperties: false },
  },
  {
    name: "open_in_lab",
    description: "Opens the Lab on a comparison, where the user can read every parameter, the full report and the applications. Any of the three can be left out to keep the current choice.",
    input_schema: { type: "object", properties: { place: { type: "string" }, region: { type: "string" }, objective: OBJECTIVE }, additionalProperties: false },
  },
  {
    name: "data_sources",
    description: "Says where the engine's data come from, how recent they are and what could not be retrieved. Use it for questions about sources, dates, updates or reliability of the data.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export interface ChatMessage {
  role: "user" | "assistant";
  content: unknown;
}

/** Checks a request body. Returns the conversation, or the reason it was rejected. */
export function parseBody(body: unknown): { messages: ChatMessage[] } | { error: string; status: number } {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { error: "The request needs a non-empty list of messages.", status: 400 };
  if (messages.length > MAX_MESSAGES) return { error: "The conversation is too long. Start a new one.", status: 413 };
  for (const m of messages as { role?: unknown; content?: unknown }[]) {
    if (m?.role !== "user" && m?.role !== "assistant") return { error: "Messages must come from the user or the assistant.", status: 400 };
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return { error: "A message has no content.", status: 400 };
  }
  if ((messages[0] as { role: string }).role !== "user") return { error: "The conversation must start with the user.", status: 400 };
  return { messages: messages as ChatMessage[] };
}

/** The request sent to the Messages API for one turn of the conversation. */
export function requestParams(messages: ChatMessage[]) {
  return {
    model: MODEL,
    max_tokens: 16000,
    // Short, tool-driven answers: medium effort is the model's default and is enough here.
    // Thinking is left adaptive (the default); it cannot be turned off on this model.
    output_config: { effort: "medium" },
    // If the model declines a request, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: TOOLS,
    messages,
  };
}
