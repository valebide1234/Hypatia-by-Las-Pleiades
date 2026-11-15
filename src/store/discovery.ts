import { create } from "zustand";
import { SITES } from "@/data/sites";
import type { DiscoveryProvider, DiscoveryQuery } from "@/discovery/DiscoveryProvider";
import { validateCandidates, type CandidateProblem } from "@/discovery/validateCandidate";
import type { AnalogSite } from "@/types/site";
import { useEngine } from "./engine";

interface LastRun {
  providerId: string;
  providerName: string;
  isTestData: boolean;
  query: DiscoveryQuery;
  at: string;
  count: number;
}

interface DiscoveryState {
  /** Validated candidates currently shown, from all runs this session (memory only). */
  candidates: AnalogSite[];
  status: "idle" | "running" | "error";
  error: string | null;
  problems: CandidateProblem[];
  lastRun: LastRun | null;
  run: (provider: DiscoveryProvider, query: DiscoveryQuery) => Promise<void>;
  clear: () => void;
}

let controller: AbortController | null = null;

export const useDiscovery = create<DiscoveryState>((set, get) => ({
  candidates: [],
  status: "idle",
  error: null,
  problems: [],
  lastRun: null,

  run: async (provider, query) => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    set({ status: "running", error: null, problems: [] });
    try {
      const raw = await provider.run(query, signal);
      if (signal.aborted) return;
      // Replace this provider's previous candidates for the same target; keep everything else.
      const kept = get().candidates.filter((c) => !(c.discovery?.providerId === provider.id && c.targets.includes(query.target)));
      const proposals = useEngine.getState().dataset?.proposals ?? [];
      const reserved = new Set([...SITES.map((s) => s.id), ...proposals.map((p) => p.id), ...kept.map((c) => c.id)]);
      const { valid, problems } = validateCandidates(provider, query, raw, reserved);
      set({
        candidates: [...kept, ...valid],
        status: "idle",
        problems,
        lastRun: { providerId: provider.id, providerName: provider.name, isTestData: Boolean(provider.isTestData), query, at: new Date().toISOString(), count: valid.length },
      });
    } catch (e) {
      if (signal.aborted) return;
      set({ status: "error", error: e instanceof Error ? e.message : "Discovery failed." });
    }
  },

  clear: () => {
    controller?.abort();
    set({ candidates: [], status: "idle", error: null, problems: [], lastRun: null });
  },
}));
