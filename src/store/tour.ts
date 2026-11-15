import { create } from "zustand";
import { TOURS, type TourId, type TourStep } from "@/tour/steps";

const STORAGE_KEY = "hypatia.tour.v1";

/** Tours this browser has already seen. Storage can be unavailable (private mode): then nothing is remembered. */
function readSeen(): TourId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is TourId => typeof x === "string" && x in TOURS) : [];
  } catch {
    return [];
  }
}

function writeSeen(seen: TourId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Not remembered; the tour will be offered again next visit.
  }
}

interface TourState {
  active: TourId | null;
  index: number;
  seen: TourId[];
  /** Starts a tour whether or not it was seen before (the "Tour" button). */
  start: (id: TourId) => void;
  /** Starts a tour only on the first visit, and only if no tour is running. */
  startIfFirstVisit: (id: TourId) => void;
  /**
   * Moves on, or ends the tour after the last step. `isMissing` tells whether an optional
   * step's element is absent from the page; such steps are passed over.
   */
  next: (isMissing?: (step: TourStep) => boolean) => void;
  back: (isMissing?: (step: TourStep) => boolean) => void;
  /** Ends the tour and marks every tour as seen: the user does not want to be guided. */
  skip: () => void;
  /** Stops without remembering anything (e.g. the page changed under the tour). */
  stop: () => void;
}

export const useTour = create<TourState>((set, get) => ({
  active: null,
  index: 0,
  seen: readSeen(),

  start: (id) => set({ active: id, index: 0 }),

  startIfFirstVisit: (id) => {
    const { active, seen } = get();
    if (active || seen.includes(id)) return;
    set({ active: id, index: 0 });
  },

  next: (isMissing) => {
    const { active, index, seen } = get();
    if (!active) return;
    const steps = TOURS[active];
    let i = index + 1;
    while (i < steps.length && steps[i]!.optional && isMissing?.(steps[i]!)) i++;
    if (i < steps.length) {
      set({ index: i });
      return;
    }
    const nextSeen = seen.includes(active) ? seen : [...seen, active];
    writeSeen(nextSeen);
    set({ active: null, index: 0, seen: nextSeen });
  },

  back: (isMissing) => {
    const { active, index } = get();
    if (!active) return;
    const steps = TOURS[active];
    let i = index - 1;
    while (i >= 0 && steps[i]!.optional && isMissing?.(steps[i]!)) i--;
    if (i >= 0) set({ index: i });
  },

  skip: () => {
    const all = Object.keys(TOURS) as TourId[];
    writeSeen(all);
    set({ active: null, index: 0, seen: all });
  },

  stop: () => set({ active: null, index: 0 }),
}));
