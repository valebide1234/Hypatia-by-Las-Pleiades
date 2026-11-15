import type { FavState, Favourite, Folder, FolderItem } from "@/lib/favourites";
import type { Target } from "@/types/site";

export interface SavedSearch {
  id: string;
  target: Target;
  qualityIds: string[];
  name: string;
  createdAt: string;
}

/** Persistence for a signed-in user's favourites, folders and saved searches. */
export interface UserDataRepo {
  readonly kind: "supabase" | "local-demo";
  load(): Promise<{ fav: FavState; searches: SavedSearch[] }>;
  insertFavourite(f: Favourite): Promise<void>;
  deleteFavourite(id: string): Promise<void>;
  updateNote(id: string, note: string): Promise<void>;
  insertFolder(f: Folder): Promise<void>;
  /** Upserts name/colour/icon/sort order for the given folders. */
  updateFolders(folders: Folder[]): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  addItems(items: FolderItem[]): Promise<void>;
  removeItems(items: FolderItem[]): Promise<void>;
  insertSearch(s: SavedSearch): Promise<void>;
  deleteSearch(id: string): Promise<void>;
}
