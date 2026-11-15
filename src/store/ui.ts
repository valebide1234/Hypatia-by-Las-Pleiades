import { create } from "zustand";

interface UiState {
  favouritesOpen: boolean;
  setFavouritesOpen: (open: boolean) => void;
  discoverOpen: boolean;
  setDiscoverOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  favouritesOpen: false,
  setFavouritesOpen: (favouritesOpen) => set({ favouritesOpen }),
  discoverOpen: false,
  setDiscoverOpen: (discoverOpen) => set({ discoverOpen }),
}));
