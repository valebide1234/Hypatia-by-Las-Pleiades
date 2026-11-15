import { create } from "zustand";
import type { LatLon } from "@/lib/geo";

/** Shared state between the globe and the panels around it. */
interface GlobeViewState {
  /** Point on the ground at the centre of the current view (null when looking at space). */
  center: LatLon | null;
  setCenter: (c: LatLon | null) => void;
  /** "Show on globe" from the Favourites panel: restricts the globe to these sites. */
  focus: { siteIds: string[]; label: string } | null;
  setFocus: (f: { siteIds: string[]; label: string } | null) => void;
  /** Request to fly to / select a site from outside the explore page (e.g. Favourites). */
  pendingSelect: string | null;
  requestSelect: (siteId: string | null) => void;
}

export const useGlobeView = create<GlobeViewState>((set) => ({
  center: null,
  setCenter: (center) => set({ center }),
  focus: null,
  setFocus: (focus) => set({ focus }),
  pendingSelect: null,
  requestSelect: (pendingSelect) => set({ pendingSelect }),
}));
