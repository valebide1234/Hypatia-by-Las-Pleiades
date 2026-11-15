import { EMPTY_FAV_STATE, type FavState } from "@/lib/favourites";
import type { SavedSearch, UserDataRepo } from "./types";

interface Stored {
  fav: FavState;
  searches: SavedSearch[];
}

/**
 * Development-only repository backed by localStorage. Used by the "demo account" that appears
 * when Supabase is not configured, so the signed-in features can be exercised locally.
 * Never used in production builds.
 */
export function createLocalRepo(key = "hypatia.demo.v1"): UserDataRepo {
  const read = (): Stored => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Stored;
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
    return { fav: EMPTY_FAV_STATE, searches: [] };
  };
  const write = (fn: (s: Stored) => Stored) => {
    const next = fn(read());
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore quota / privacy-mode errors in the demo */
    }
  };
  const sameItem = (a: { folderId: string; favouriteId: string }, b: { folderId: string; favouriteId: string }) =>
    a.folderId === b.folderId && a.favouriteId === b.favouriteId;

  return {
    kind: "local-demo",
    async load() {
      return read();
    },
    async insertFavourite(f) {
      write((s) => ({ ...s, fav: { ...s.fav, favourites: [...s.fav.favourites.filter((x) => x.id !== f.id), f] } }));
    },
    async deleteFavourite(id) {
      write((s) => ({
        ...s,
        fav: { ...s.fav, favourites: s.fav.favourites.filter((x) => x.id !== id), items: s.fav.items.filter((i) => i.favouriteId !== id) },
      }));
    },
    async updateNote(id, note) {
      write((s) => ({ ...s, fav: { ...s.fav, favourites: s.fav.favourites.map((f) => (f.id === id ? { ...f, note } : f)) } }));
    },
    async insertFolder(f) {
      write((s) => ({ ...s, fav: { ...s.fav, folders: [...s.fav.folders, f] } }));
    },
    async updateFolders(folders) {
      write((s) => ({ ...s, fav: { ...s.fav, folders: s.fav.folders.map((f) => folders.find((u) => u.id === f.id) ?? f) } }));
    },
    async deleteFolder(id) {
      write((s) => ({
        ...s,
        fav: { ...s.fav, folders: s.fav.folders.filter((f) => f.id !== id), items: s.fav.items.filter((i) => i.folderId !== id) },
      }));
    },
    async addItems(items) {
      write((s) => ({ ...s, fav: { ...s.fav, items: [...s.fav.items, ...items.filter((i) => !s.fav.items.some((x) => sameItem(x, i)))] } }));
    },
    async removeItems(items) {
      write((s) => ({ ...s, fav: { ...s.fav, items: s.fav.items.filter((x) => !items.some((i) => sameItem(x, i))) } }));
    },
    async insertSearch(search) {
      write((s) => ({ ...s, searches: [search, ...s.searches] }));
    },
    async deleteSearch(id) {
      write((s) => ({ ...s, searches: s.searches.filter((x) => x.id !== id) }));
    },
  };
}
