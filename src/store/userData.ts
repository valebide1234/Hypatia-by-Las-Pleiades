import { create } from "zustand";
import {
  EMPTY_FAV_STATE,
  addFavourite,
  addToFolder,
  createFolder,
  deleteFolder,
  diffItems,
  favouriteForSite,
  moveFavourite,
  removeFavourite,
  reorderFolders as reorderFoldersPure,
  restoreFavourite,
  setFoldersFor,
  shiftFolder,
  updateFolder,
  updateNote,
  type FavState,
  type Favourite,
  type Folder,
  type FolderItem,
} from "@/lib/favourites";
import type { SavedSearch, UserDataRepo } from "@/data/repo/types";
import type { Target } from "@/types/site";

type Status = "idle" | "loading" | "ready" | "error";

interface Removed {
  favourite: Favourite;
  items: FolderItem[];
}

interface UserDataState {
  repo: UserDataRepo | null;
  status: Status;
  error: string | null;
  fav: FavState;
  searches: SavedSearch[];
  /** Last removed favourite, offered for Undo. */
  lastRemoved: Removed | null;

  connect: (repo: UserDataRepo) => Promise<void>;
  disconnect: () => void;
  reload: () => Promise<void>;

  saveFavourite: (siteId: string, note: string, folderIds: string[]) => Promise<void>;
  updateFavourite: (favouriteId: string, note: string, folderIds: string[]) => Promise<void>;
  removeFavourite: (favouriteId: string) => Promise<void>;
  undoRemove: () => Promise<void>;
  dismissUndo: () => void;
  setNote: (favouriteId: string, note: string) => Promise<void>;

  createFolder: (name: string, color?: string | null, icon?: string | null) => Promise<Folder>;
  editFolder: (folderId: string, patch: Partial<Pick<Folder, "name" | "color" | "icon">>) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  shiftFolder: (folderId: string, delta: -1 | 1) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;
  moveFavourite: (favouriteId: string, fromFolderId: string | null, toFolderId: string | null) => Promise<void>;
  copyFavourite: (favouriteId: string, toFolderId: string) => Promise<void>;

  saveSearch: (target: Target, qualityIds: string[], name: string) => Promise<void>;
  deleteSearch: (id: string) => Promise<void>;
}

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const useUserData = create<UserDataState>((set, get) => {
  /** Applies a state change optimistically, then persists it; on failure reloads from the server. */
  async function commit(next: FavState, persist: (repo: UserDataRepo) => Promise<void>) {
    const repo = get().repo;
    if (!repo) return;
    set({ fav: next, error: null });
    try {
      await persist(repo);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not save your change." });
      await get().reload();
    }
  }

  async function syncItems(before: FolderItem[], after: FolderItem[], repo: UserDataRepo) {
    const { added, removed } = diffItems(before, after);
    await repo.removeItems(removed);
    await repo.addItems(added);
  }

  /** Persists sort orders of folders whose order changed. */
  async function syncFolderOrder(before: Folder[], after: Folder[], repo: UserDataRepo) {
    const changed = after.filter((f) => before.find((b) => b.id === f.id)?.sortOrder !== f.sortOrder);
    await repo.updateFolders(changed);
  }

  return {
    repo: null,
    status: "idle",
    error: null,
    fav: EMPTY_FAV_STATE,
    searches: [],
    lastRemoved: null,

    connect: async (repo) => {
      set({ repo, status: "loading", error: null, fav: EMPTY_FAV_STATE, searches: [], lastRemoved: null });
      await get().reload();
    },
    disconnect: () => set({ repo: null, status: "idle", error: null, fav: EMPTY_FAV_STATE, searches: [], lastRemoved: null }),
    reload: async () => {
      const repo = get().repo;
      if (!repo) return;
      try {
        const { fav, searches } = await repo.load();
        if (get().repo === repo) set({ fav, searches, status: "ready" });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : "Could not load your favourites." });
      }
    },

    saveFavourite: async (siteId, note, folderIds) => {
      const s = get().fav;
      const existing = favouriteForSite(s, siteId);
      if (existing) return get().updateFavourite(existing.id, note, folderIds);
      const fav: Favourite = { id: uuid(), siteId, note: note.trim(), createdAt: now() };
      const next = addFavourite(s, fav, folderIds);
      await commit(next, async (repo) => {
        await repo.insertFavourite(fav);
        await repo.addItems(next.items.filter((i) => i.favouriteId === fav.id));
      });
    },
    updateFavourite: async (favouriteId, note, folderIds) => {
      const s = get().fav;
      const next = setFoldersFor(updateNote(s, favouriteId, note.trim()), favouriteId, folderIds);
      await commit(next, async (repo) => {
        await repo.updateNote(favouriteId, note.trim());
        await syncItems(s.items, next.items, repo);
      });
    },
    removeFavourite: async (favouriteId) => {
      const { state, removed } = removeFavourite(get().fav, favouriteId);
      if (!removed) return;
      set({ lastRemoved: removed });
      await commit(state, (repo) => repo.deleteFavourite(favouriteId));
    },
    undoRemove: async () => {
      const removed = get().lastRemoved;
      if (!removed) return;
      set({ lastRemoved: null });
      const next = restoreFavourite(get().fav, removed);
      await commit(next, async (repo) => {
        await repo.insertFavourite(removed.favourite);
        await repo.addItems(next.items.filter((i) => i.favouriteId === removed.favourite.id));
      });
    },
    dismissUndo: () => set({ lastRemoved: null }),
    setNote: async (favouriteId, note) => {
      await commit(updateNote(get().fav, favouriteId, note.trim()), (repo) => repo.updateNote(favouriteId, note.trim()));
    },

    createFolder: async (name, color = null, icon = null) => {
      const s = get().fav;
      const next = createFolder(s, { id: uuid(), name: name.trim(), color, icon, createdAt: now() });
      const folder = next.folders[next.folders.length - 1]!;
      await commit(next, (repo) => repo.insertFolder(folder));
      return folder;
    },
    editFolder: async (folderId, patch) => {
      const next = updateFolder(get().fav, folderId, patch);
      const folder = next.folders.find((f) => f.id === folderId);
      if (!folder) return;
      await commit(next, (repo) => repo.updateFolders([folder]));
    },
    deleteFolder: async (folderId) => {
      await commit(deleteFolder(get().fav, folderId), (repo) => repo.deleteFolder(folderId));
    },
    shiftFolder: async (folderId, delta) => {
      const s = get().fav;
      const next = shiftFolder(s, folderId, delta);
      if (next === s) return;
      await commit(next, (repo) => syncFolderOrder(s.folders, next.folders, repo));
    },
    reorderFolders: async (orderedIds) => {
      const s = get().fav;
      const next = reorderFoldersPure(s, orderedIds);
      await commit(next, (repo) => syncFolderOrder(s.folders, next.folders, repo));
    },
    moveFavourite: async (favouriteId, from, to) => {
      const s = get().fav;
      const next = moveFavourite(s, favouriteId, from, to);
      if (next === s) return;
      await commit(next, (repo) => syncItems(s.items, next.items, repo));
    },
    copyFavourite: async (favouriteId, to) => {
      const s = get().fav;
      const next = addToFolder(s, favouriteId, to);
      if (next === s) return;
      await commit(next, (repo) => syncItems(s.items, next.items, repo));
    },

    saveSearch: async (target, qualityIds, name) => {
      const repo = get().repo;
      if (!repo) return;
      const search: SavedSearch = { id: uuid(), target, qualityIds: [...qualityIds], name: name.trim(), createdAt: now() };
      set((st) => ({ searches: [search, ...st.searches] }));
      try {
        await repo.insertSearch(search);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Could not save the search." });
        await get().reload();
      }
    },
    deleteSearch: async (id) => {
      const repo = get().repo;
      if (!repo) return;
      set((st) => ({ searches: st.searches.filter((x) => x.id !== id) }));
      try {
        await repo.deleteSearch(id);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Could not delete the search." });
        await get().reload();
      }
    },
  };
});
