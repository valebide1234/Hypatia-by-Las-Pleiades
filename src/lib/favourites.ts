import type { AnalogSite, SiteOrigin, Target } from "@/types/site";
import { matchSite, rankSites } from "./ranking";
import { haversineKm, type LatLon } from "./geo";

/**
 * Favourites and folders: pure state operations, filtering and sorting
 * (hypatia_claude_code_prompt.md §6). No I/O here; tested in favourites.test.ts.
 */

export interface Favourite {
  id: string;
  siteId: string;
  note: string;
  createdAt: string; // ISO
}

export interface Folder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface FolderItem {
  folderId: string;
  favouriteId: string;
}

export interface FavState {
  favourites: Favourite[];
  folders: Folder[];
  items: FolderItem[];
}

export const EMPTY_FAV_STATE: FavState = { favourites: [], folders: [], items: [] };

// ── Queries ──────────────────────────────────────────────────────────────────────────────────

export const favouriteForSite = (s: FavState, siteId: string) => s.favourites.find((f) => f.siteId === siteId);

export const foldersOf = (s: FavState, favouriteId: string): Folder[] =>
  sortFolders(s.folders.filter((f) => s.items.some((i) => i.folderId === f.id && i.favouriteId === favouriteId)));

export const isUnfiled = (s: FavState, favouriteId: string) => !s.items.some((i) => i.favouriteId === favouriteId);

export const folderCount = (s: FavState, folderId: string) => s.items.filter((i) => i.folderId === folderId).length;

export const sortFolders = (folders: Folder[]): Folder[] =>
  [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

// ── Mutations (immutable) ────────────────────────────────────────────────────────────────────

/** Adds a favourite (or returns the state unchanged if the site is already saved) and files it. */
export function addFavourite(s: FavState, fav: Favourite, folderIds: string[] = []): FavState {
  if (favouriteForSite(s, fav.siteId)) return s;
  const valid = folderIds.filter((id) => s.folders.some((f) => f.id === id));
  return {
    ...s,
    favourites: [...s.favourites, fav],
    items: [...s.items, ...[...new Set(valid)].map((folderId) => ({ folderId, favouriteId: fav.id }))],
  };
}

/** Removes a favourite and all of its folder memberships. Returns what was removed, for Undo. */
export function removeFavourite(s: FavState, favouriteId: string): { state: FavState; removed: { favourite: Favourite; items: FolderItem[] } | null } {
  const favourite = s.favourites.find((f) => f.id === favouriteId);
  if (!favourite) return { state: s, removed: null };
  const items = s.items.filter((i) => i.favouriteId === favouriteId);
  return {
    state: { ...s, favourites: s.favourites.filter((f) => f.id !== favouriteId), items: s.items.filter((i) => i.favouriteId !== favouriteId) },
    removed: { favourite, items },
  };
}

/** Restores a removed favourite with its memberships (folders that no longer exist are skipped). */
export function restoreFavourite(s: FavState, removed: { favourite: Favourite; items: FolderItem[] }): FavState {
  if (s.favourites.some((f) => f.id === removed.favourite.id || f.siteId === removed.favourite.siteId)) return s;
  const items = removed.items.filter((i) => s.folders.some((f) => f.id === i.folderId));
  return { ...s, favourites: [...s.favourites, removed.favourite], items: [...s.items, ...items] };
}

export function updateNote(s: FavState, favouriteId: string, note: string): FavState {
  return { ...s, favourites: s.favourites.map((f) => (f.id === favouriteId ? { ...f, note } : f)) };
}

export function createFolder(s: FavState, folder: Omit<Folder, "sortOrder"> & { sortOrder?: number }): FavState {
  const sortOrder = folder.sortOrder ?? (s.folders.length ? Math.max(...s.folders.map((f) => f.sortOrder)) + 1 : 0);
  return { ...s, folders: [...s.folders, { ...folder, sortOrder }] };
}

export function updateFolder(s: FavState, folderId: string, patch: Partial<Pick<Folder, "name" | "color" | "icon">>): FavState {
  return { ...s, folders: s.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)) };
}

/** Deletes a folder and its memberships only; the favourites themselves are kept. */
export function deleteFolder(s: FavState, folderId: string): FavState {
  return { ...s, folders: s.folders.filter((f) => f.id !== folderId), items: s.items.filter((i) => i.folderId !== folderId) };
}

/** Reassigns sort orders 0..n-1 following `orderedIds`; folders not listed keep their relative order at the end. */
export function reorderFolders(s: FavState, orderedIds: string[]): FavState {
  const known = orderedIds.filter((id) => s.folders.some((f) => f.id === id));
  const rest = sortFolders(s.folders.filter((f) => !known.includes(f.id))).map((f) => f.id);
  const order = [...known, ...rest];
  return { ...s, folders: s.folders.map((f) => ({ ...f, sortOrder: order.indexOf(f.id) })) };
}

/** Moves a folder one step up (-1) or down (+1) in the order. */
export function shiftFolder(s: FavState, folderId: string, delta: -1 | 1): FavState {
  const ids = sortFolders(s.folders).map((f) => f.id);
  const i = ids.indexOf(folderId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return s;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return reorderFolders(s, ids);
}

export function addToFolder(s: FavState, favouriteId: string, folderId: string): FavState {
  if (!s.folders.some((f) => f.id === folderId) || !s.favourites.some((f) => f.id === favouriteId)) return s;
  if (s.items.some((i) => i.folderId === folderId && i.favouriteId === favouriteId)) return s;
  return { ...s, items: [...s.items, { folderId, favouriteId }] };
}

export function removeFromFolder(s: FavState, favouriteId: string, folderId: string): FavState {
  return { ...s, items: s.items.filter((i) => !(i.folderId === folderId && i.favouriteId === favouriteId)) };
}

/**
 * Move = copy into `toFolderId` and remove from `fromFolderId`. From "All"/"Unfiled"
 * (fromFolderId null) it is the same as a copy. `toFolderId` null means "move to Unfiled":
 * remove from the source folder (or from every folder when the source is null).
 */
export function moveFavourite(s: FavState, favouriteId: string, fromFolderId: string | null, toFolderId: string | null): FavState {
  if (toFolderId === null) {
    return fromFolderId ? removeFromFolder(s, favouriteId, fromFolderId) : { ...s, items: s.items.filter((i) => i.favouriteId !== favouriteId) };
  }
  if (fromFolderId === toFolderId || !s.folders.some((f) => f.id === toFolderId)) return s;
  const added = addToFolder(s, favouriteId, toFolderId);
  return fromFolderId ? removeFromFolder(added, favouriteId, fromFolderId) : added;
}

/** Replaces a favourite's folder set (used by the save dialog). */
export function setFoldersFor(s: FavState, favouriteId: string, folderIds: string[]): FavState {
  const valid = [...new Set(folderIds)].filter((id) => s.folders.some((f) => f.id === id));
  return { ...s, items: [...s.items.filter((i) => i.favouriteId !== favouriteId), ...valid.map((folderId) => ({ folderId, favouriteId }))] };
}

/** Diff between two states' memberships, for syncing to a backend. */
export function diffItems(before: FolderItem[], after: FolderItem[]): { added: FolderItem[]; removed: FolderItem[] } {
  const key = (i: FolderItem) => `${i.folderId}|${i.favouriteId}`;
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { added: after.filter((i) => !b.has(key(i))), removed: before.filter((i) => !a.has(key(i))) };
}

// ── Filtering & sorting ──────────────────────────────────────────────────────────────────────

/** "all" = every favourite, "unfiled" = in no folder, otherwise a folder id. */
export type FolderView = "all" | "unfiled" | string;
export type TargetFilter = "both" | Target;
export type FavSort = "date" | "name" | "score" | "distance";

export interface FavCriteria {
  text: string;
  target: TargetFilter;
  origins: SiteOrigin[]; // empty = any
  qualityIds: string[]; // empty = any
  countries: string[]; // empty = any
  folder: FolderView;
}

export const DEFAULT_CRITERIA: FavCriteria = { text: "", target: "both", origins: [], qualityIds: [], countries: [], folder: "all" };

export interface FavEntry {
  favourite: Favourite;
  /** Undefined when the site is no longer in the catalogue (e.g. a withdrawn candidate). */
  site: AnalogSite | undefined;
}

const norm = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filterFavourites(s: FavState, entries: FavEntry[], c: FavCriteria): FavEntry[] {
  const q = norm(c.text.trim());
  return entries.filter(({ favourite, site }) => {
    if (c.folder === "unfiled" && !isUnfiled(s, favourite.id)) return false;
    if (c.folder !== "all" && c.folder !== "unfiled" && !s.items.some((i) => i.folderId === c.folder && i.favouriteId === favourite.id)) return false;
    if (q && !norm(`${site?.name ?? favourite.siteId} ${site?.country ?? ""} ${favourite.note}`).includes(q)) return false;
    if (!site) return c.target === "both" && c.origins.length === 0 && c.qualityIds.length === 0 && c.countries.length === 0;
    if (c.target !== "both" && !site.targets.includes(c.target)) return false;
    if (c.origins.length && !c.origins.includes(site.origin)) return false;
    if (c.countries.length && !c.countries.includes(site.country)) return false;
    if (c.qualityIds.length) {
      // Same matching rules as the globe filter; with "both" the site may match either target.
      const targets: Target[] = c.target === "both" ? site.targets : [c.target];
      if (!targets.some((t) => matchSite(site, t, c.qualityIds))) return false;
    }
    return true;
  });
}

export interface SortContext {
  /** Target and qualities used for "ranking score" sorting (the globe's current filters). */
  target: Target;
  qualityIds: string[];
  /** Centre of the current globe view, for "distance" sorting. */
  viewCenter: LatLon | null;
}

/**
 * Sorts entries. "date" = newest first; "name" = A→Z; "score" = ranking score for the current
 * globe filters (non-matching sites last, then by name); "distance" = nearest to the view centre.
 */
export function sortFavourites(entries: FavEntry[], sort: FavSort, ctx: SortContext): FavEntry[] {
  const name = (e: FavEntry) => e.site?.name ?? e.favourite.siteId;
  const byName = (a: FavEntry, b: FavEntry) => name(a).localeCompare(name(b));
  const out = [...entries];
  switch (sort) {
    case "date":
      return out.sort((a, b) => b.favourite.createdAt.localeCompare(a.favourite.createdAt) || byName(a, b));
    case "name":
      return out.sort(byName);
    case "score": {
      const sites = out.map((e) => e.site).filter((x): x is AnalogSite => Boolean(x));
      const score = new Map(ctx.qualityIds.length ? rankSites(sites, ctx.target, ctx.qualityIds).map((r) => [r.site.id, r.score]) : []);
      return out.sort((a, b) => (score.get(b.site?.id ?? "") ?? -1) - (score.get(a.site?.id ?? "") ?? -1) || byName(a, b));
    }
    case "distance": {
      if (!ctx.viewCenter) return out.sort(byName);
      const d = (e: FavEntry) => (e.site ? haversineKm(ctx.viewCenter!, { lat: e.site.lat, lon: e.site.lon }) : Infinity);
      return out.sort((a, b) => d(a) - d(b) || byName(a, b));
    }
  }
}
