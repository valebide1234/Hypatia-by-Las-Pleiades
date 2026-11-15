import { create } from "zustand";
import type { Target } from "@/types/site";

/** Selected qualities, kept separately per target so switching Moon ↔ Mars preserves each set. */
interface FilterState {
  selected: Record<Target, string[]>;
  toggle: (target: Target, qualityId: string) => void;
  setSelected: (target: Target, qualityIds: string[]) => void;
  clear: (target: Target) => void;
}

export const useFilters = create<FilterState>((set) => ({
  selected: { moon: [], mars: [] },
  toggle: (target, id) =>
    set((s) => {
      const cur = s.selected[target];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { selected: { ...s.selected, [target]: next } };
    }),
  setSelected: (target, ids) => set((s) => ({ selected: { ...s.selected, [target]: [...new Set(ids)] } })),
  clear: (target) => set((s) => ({ selected: { ...s.selected, [target]: [] } })),
}));
