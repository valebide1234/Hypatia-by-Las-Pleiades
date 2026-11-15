import { create } from "zustand";
import { latestGranuleDate, loadEngineDataset } from "@/discovery/engine/loadDataset";
import type { EngineDataset } from "@/discovery/engine/types";

/** Collection whose newest granule tells how recent the engine's climate data can be. */
const REFERENCE_COLLECTION = "M2TMNXSLV";

interface EngineState {
  dataset: EngineDataset | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /**
   * Newest month NASA has published for the reference collection, asked live from NASA's
   * catalogue ("YYYY-MM"), or null if it could not be asked.
   */
  nasaLatest: string | null;
  /** Loads the engine data file (once) and then asks NASA how recent its archive is. */
  load: () => Promise<void>;
}

export const useEngine = create<EngineState>((set, get) => ({
  dataset: null,
  status: "idle",
  error: null,
  nasaLatest: null,

  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const dataset = await loadEngineDataset();
      set({ dataset, status: "ready" });
      const latest = await latestGranuleDate(REFERENCE_COLLECTION);
      if (latest) set({ nasaLatest: latest.slice(0, 7) });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "The engine data could not be loaded." });
    }
  },
}));

/** True when NASA's archive holds a newer month than the engine file was built with. */
export function isBehindNasa(dataset: EngineDataset | null, nasaLatest: string | null): boolean {
  const through = dataset?.windows.through;
  return Boolean(through && nasaLatest && nasaLatest > through);
}
