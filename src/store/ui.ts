import { create } from "zustand";

interface UiState {
  favouritesOpen: boolean;
  setFavouritesOpen: (open: boolean) => void;
  discoverOpen: boolean;
  setDiscoverOpen: (open: boolean) => void;
  /** Mission region the discovery panel should start from (set when coming from the Lab). */
  discoverRegion: string;
  setDiscoverRegion: (regionId: string) => void;
}

export const useUi = create<UiState>((set) => ({
  favouritesOpen: false,
  setFavouritesOpen: (favouritesOpen) => set({ favouritesOpen }),
  discoverOpen: false,
  setDiscoverOpen: (discoverOpen) => set({ discoverOpen }),
  discoverRegion: "",
  setDiscoverRegion: (discoverRegion) => set({ discoverRegion }),
}));
