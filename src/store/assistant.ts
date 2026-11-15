import { create } from "zustand";
import { runAgent } from "@/assistant/agent";
import { ASSISTANT_URL, AssistantUnavailable, type ApiMessage } from "@/assistant/protocol";
import type { ToolEnv } from "@/assistant/tools";
import { pick, translate, tx, useLang } from "@/i18n";
import { describeAddedPlace, localAnswer, type AssistantContext } from "@/lab/assistant";
import { fetchLivePlace, locate } from "@/lab/livePlace";
import { allPlaces, useLab, withCustomObjective } from "@/lab/store";
import { useEngine } from "@/store/engine";
import type { Target } from "@/types/site";

export interface ChatMessage {
  from: "user" | "assistant";
  text: string;
  /** How the answer was produced. */
  by?: "ai" | "rules";
  /** Tools the AI used for it. */
  tools?: string[];
}

/** What each tool does, in words, shown while it runs. */
export const TOOL_LABEL: Record<string, string> = {
  list_regions: tx("Listing the mission regions"),
  search_places: tx("Looking up places"),
  rank_places: tx("Ranking places for the region"),
  compare: tx("Comparing the pair"),
  place_profile: tx("Reading the place's data"),
  discover_new_places: tx("Running the discovery engine"),
  add_place: tx("Requesting NASA POWER for the new place"),
  show_on_globe: tx("Opening the globe"),
  open_in_lab: tx("Opening the Lab"),
  data_sources: tx("Checking the data sources"),
};

interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: ChatMessage[];
  /** The conversation as the AI sees it (kept apart from what is shown). */
  history: ApiMessage[];
  busy: boolean;
  /** What the assistant is doing right now, for the status line. */
  activity: string | null;
  /** ai: Claude is answering. rules: the built-in answers. unknown: not asked yet. */
  mode: "unknown" | "ai" | "rules";
  ask: (question: string, navigate: (path: string) => void) => Promise<void>;
  reset: () => void;
}

/** Where the user is in the app, so "this place" or "here" can be understood. */
function appContext(): { target: Target; note: string } {
  const path = window.location.pathname;
  const lab = useLab.getState();
  const onGlobe = /\/explore\/(moon|mars)$/.exec(path);
  const target: Target = onGlobe ? (onGlobe[1] as Target) : lab.target;
  const ds = lab.dataset;
  const place = ds ? allPlaces(ds, lab.userPlaces, lab.candidatePlaces).find((p) => p.id === lab.placeId) : undefined;
  const region = ds?.regions.find((r) => r.id === lab.regionId);
  const page = onGlobe ? `globe of ${target} analogs` : path.endsWith("/lab") ? "Lab" : "target selection";
  const pair = place && region ? `; pair selected in the Lab: "${pick("en", place.name)}" (${place.id}) and "${pick("en", region.name)}" (${region.id}), objective ${lab.objectiveId}` : "";
  return { target, note: `[App context: page = ${page}; body being explored = ${target}${pair}; interface language = ${useLang.getState().lang}]` };
}

export const useAssistant = create<AssistantState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  messages: [],
  history: [],
  busy: false,
  activity: null,
  mode: ASSISTANT_URL ? "unknown" : "rules",

  reset: () => set({ messages: [], history: [], activity: null }),

  ask: async (question, navigate) => {
    const q = question.trim();
    if (!q || get().busy) return;
    const lang = useLang.getState().lang;
    const t = (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars);
    const say = (m: ChatMessage) => set((s) => ({ messages: [...s.messages, m] }));
    say({ from: "user", text: q });
    set({ busy: true, activity: null });

    try {
      await Promise.all([useLab.getState().load(), useEngine.getState().load()]);
      const loaded = useLab.getState().dataset;
      if (!loaded) throw new Error(t("The engine's data could not be loaded."));
      const lab = withCustomObjective(loaded, useLab.getState().weights);
      const engine = useEngine.getState().dataset;
      const { target, note } = appContext();

      // 1. The AI, when this copy has it.
      if (get().mode !== "rules") {
        try {
          const env: ToolEnv = { lab, engine, lang, target, navigate };
          const result = await runAgent(get().history, `${note}\n${q}`, env, (name) => set({ activity: t(TOOL_LABEL[name] ?? name) }));
          set({ history: result.history, mode: "ai" });
          say({ from: "assistant", text: result.text, by: "ai", tools: result.tools });
          return;
        } catch (e) {
          if (!(e instanceof AssistantUnavailable)) throw e;
          set({ mode: "rules" }); // no key on this copy: answer with the built-in rules from now on
        }
      }

      // 2. The built-in answers: same data, fixed wording.
      const s = useLab.getState();
      const ctx = (): AssistantContext => ({ ds: lab, places: allPlaces(lab, useLab.getState().userPlaces, useLab.getState().candidatePlaces), target, objectiveId: s.objectiveId in lab.objectives ? s.objectiveId : "balanced", lang, t, discovery: engine });
      let reply = localAnswer(q, ctx());
      if (reply.addQuery) {
        set({ activity: t(TOOL_LABEL.add_place!) });
        const place = await fetchLivePlace(await locate(reply.addQuery, lang));
        useLab.getState().addUserPlace(place);
        reply = describeAddedPlace(place, ctx());
      }
      if (reply.select) useLab.getState().select(reply.select);
      say({ from: "assistant", text: reply.text, by: "rules" });
    } catch (e) {
      say({ from: "assistant", text: `${t("That did not work:")} ${e instanceof Error ? e.message : ""}`, by: "rules" });
    } finally {
      set({ busy: false, activity: null });
    }
  },
}));
