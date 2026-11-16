import { describe, expect, it } from "vitest";
import { SITES } from "@/data/sites";
import {
  DEFAULT_CRITERIA,
  EMPTY_FAV_STATE,
  addFavourite,
  addToFolder,
  createFolder,
  deleteFolder,
  diffItems,
  favouriteForSite,
  filterFavourites,
  folderCount,
  foldersOf,
  isUnfiled,
  moveFavourite,
  removeFavourite,
  removeFromFolder,
  reorderFolders,
  restoreFavourite,
  setFoldersFor,
  shiftFolder,
  sortFavourites,
  sortFolders,
  updateFolder,
  updateNote,
  type FavEntry,
  type FavState,
  type Favourite,
} from "./favourites";
import { haversineKm } from "./geo";

const fav = (id: string, siteId: string, createdAt = "2026-01-01T00:00:00Z", note = ""): Favourite => ({ id, siteId, note, createdAt });
const folder = (id: string, name = id, createdAt = "2026-01-01T00:00:00Z") => ({ id, name, color: null, icon: null, createdAt });

function base(): FavState {
  let s = EMPTY_FAV_STATE;
  s = createFolder(s, folder("f1", "Volcanic"));
  s = createFolder(s, folder("f2", "Cold"));
  s = addFavourite(s, fav("a", "kilauea-iki", "2026-01-03T00:00:00Z", "BASALT site"), ["f1"]);
  s = addFavourite(s, fav("b", "mcmurdo-dry-valleys", "2026-01-02T00:00:00Z"), ["f2"]);
  s = addFavourite(s, fav("c", "nordlinger-ries", "2026-01-04T00:00:00Z", "Apollo 14 training"));
  s = addFavourite(s, fav("d", "lanzarote", "2026-01-01T00:00:00Z"), ["f1", "f2"]);
  return s;
}
const entries = (s: FavState): FavEntry[] => s.favourites.map((f) => ({ favourite: f, site: SITES.find((x) => x.id === f.siteId) }));

describe("saving favourites", () => {
  it("adds a site once (unique per site) and files it into existing folders only", () => {
    let s = base();
    expect(s.favourites).toHaveLength(4);
    s = addFavourite(s, fav("z", "kilauea-iki"));
    expect(s.favourites).toHaveLength(4);
    s = addFavourite(s, fav("e", "dallol-danakil"), ["f1", "nope", "f1"]);
    expect(foldersOf(s, "e").map((f) => f.id)).toEqual(["f1"]);
    expect(favouriteForSite(s, "dallol-danakil")?.id).toBe("e");
  });

  it("a site can be in several folders; sites in no folder are unfiled", () => {
    const s = base();
    expect(foldersOf(s, "d").map((f) => f.name)).toEqual(["Volcanic", "Cold"]);
    expect(isUnfiled(s, "c")).toBe(true);
    expect(isUnfiled(s, "a")).toBe(false);
    expect(folderCount(s, "f1")).toBe(2);
  });

  it("updates notes", () => {
    expect(updateNote(base(), "b", "polygons").favourites.find((f) => f.id === "b")!.note).toBe("polygons");
  });

  it("setFoldersFor replaces memberships", () => {
    const s = setFoldersFor(base(), "d", ["f2", "missing"]);
    expect(foldersOf(s, "d").map((f) => f.id)).toEqual(["f2"]);
  });
});

describe("removing with undo", () => {
  it("removes the favourite and its memberships, and restore brings both back", () => {
    const { state, removed } = removeFavourite(base(), "d");
    expect(state.favourites.some((f) => f.id === "d")).toBe(false);
    expect(state.items.some((i) => i.favouriteId === "d")).toBe(false);
    const back = restoreFavourite(state, removed!);
    expect(foldersOf(back, "d").map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("restore skips folders deleted in the meantime", () => {
    const { state, removed } = removeFavourite(base(), "d");
    const back = restoreFavourite(deleteFolder(state, "f2"), removed!);
    expect(foldersOf(back, "d").map((f) => f.id)).toEqual(["f1"]);
  });

  it("removing an unknown id is a no-op", () => {
    const s = base();
    expect(removeFavourite(s, "nope")).toEqual({ state: s, removed: null });
  });
});

describe("folders", () => {
  it("creates folders at the end of the order, renames and recolours them", () => {
    let s = createFolder(base(), folder("f3", "Impact"));
    expect(sortFolders(s.folders).map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    s = updateFolder(s, "f3", { name: "Impacts", color: "#f59e0b", icon: "diamond" });
    expect(s.folders.find((f) => f.id === "f3")).toMatchObject({ name: "Impacts", color: "#f59e0b", icon: "diamond" });
  });

  it("deleting a folder keeps its favourites; they become unfiled unless in another folder", () => {
    const s = deleteFolder(base(), "f1");
    expect(s.favourites).toHaveLength(4);
    expect(isUnfiled(s, "a")).toBe(true); // was only in f1
    expect(isUnfiled(s, "d")).toBe(false); // still in f2
    expect(s.items.some((i) => i.folderId === "f1")).toBe(false);
  });

  it("reorders folders explicitly and step by step", () => {
    let s = createFolder(base(), folder("f3"));
    s = reorderFolders(s, ["f3", "f1"]);
    expect(sortFolders(s.folders).map((f) => f.id)).toEqual(["f3", "f1", "f2"]);
    s = shiftFolder(s, "f2", -1);
    expect(sortFolders(s.folders).map((f) => f.id)).toEqual(["f3", "f2", "f1"]);
    expect(shiftFolder(s, "f3", -1)).toBe(s); // already first
  });
});

describe("move and copy", () => {
  it("copy adds a membership; duplicates and unknown folders are ignored", () => {
    let s = addToFolder(base(), "c", "f1");
    expect(foldersOf(s, "c").map((f) => f.id)).toEqual(["f1"]);
    expect(addToFolder(s, "c", "f1")).toBe(s);
    expect(addToFolder(s, "c", "nope")).toBe(s);
    s = removeFromFolder(s, "c", "f1");
    expect(isUnfiled(s, "c")).toBe(true);
  });

  it("move from a folder removes it from the source", () => {
    const s = moveFavourite(base(), "a", "f1", "f2");
    expect(foldersOf(s, "a").map((f) => f.id)).toEqual(["f2"]);
  });

  it("move from All/Unfiled acts as a copy", () => {
    const s = moveFavourite(base(), "c", null, "f2");
    expect(foldersOf(s, "c").map((f) => f.id)).toEqual(["f2"]);
  });

  it("move to Unfiled removes from the source folder, or from every folder", () => {
    expect(foldersOf(moveFavourite(base(), "d", "f1", null), "d").map((f) => f.id)).toEqual(["f2"]);
    expect(isUnfiled(moveFavourite(base(), "d", null, null), "d")).toBe(true);
  });

  it("moving to the same or a missing folder changes nothing", () => {
    const s = base();
    expect(moveFavourite(s, "a", "f1", "f1")).toBe(s);
    expect(moveFavourite(s, "a", "f1", "missing")).toBe(s);
  });

  it("diffItems reports added and removed memberships", () => {
    const before = base();
    const after = moveFavourite(before, "a", "f1", "f2");
    expect(diffItems(before.items, after.items)).toEqual({
      added: [{ folderId: "f2", favouriteId: "a" }],
      removed: [{ folderId: "f1", favouriteId: "a" }],
    });
  });
});

describe("filtering inside the panel", () => {
  const s = base();
  const all = entries(s);
  const ids = (xs: FavEntry[]) => xs.map((e) => e.favourite.id).sort();

  it("searches name, country and note (accent-insensitive)", () => {
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, text: "apollo" }))).toEqual(["c"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, text: "antarctica" }))).toEqual(["b"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, text: "nordlinger" }))).toEqual(["c"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, text: "basalt" }))).toEqual(["a"]);
  });

  it("filters by folder, unfiled and all", () => {
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, folder: "f1" }))).toEqual(["a", "d"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, folder: "unfiled" }))).toEqual(["c"]);
    expect(ids(filterFavourites(s, all, DEFAULT_CRITERIA))).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by target, pin type and country", () => {
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, target: "moon" }))).toEqual(["c", "d"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, origins: ["literature"] }))).toEqual(["b", "d"]);
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, countries: ["Spain", "Germany"] }))).toEqual(["c", "d"]);
  });

  it("filters by qualities with the same matching rules as the globe (limitations exclude)", () => {
    // McMurdo lists low_biomass as a similarity; Kīlauea lists it as a limitation.
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, qualityIds: ["low_biomass"] }))).toEqual(["b"]);
    // Lava tubes: Lanzarote matches for both targets.
    expect(ids(filterFavourites(s, all, { ...DEFAULT_CRITERIA, qualityIds: ["lava_tubes"], target: "moon" }))).toEqual(["d"]);
  });

  it("keeps favourites whose site is missing only when no site-based filter is active", () => {
    const st = addFavourite(s, fav("x", "withdrawn-candidate"));
    const es = entries(st);
    expect(ids(filterFavourites(st, es, DEFAULT_CRITERIA))).toContain("x");
    expect(ids(filterFavourites(st, es, { ...DEFAULT_CRITERIA, target: "mars" }))).not.toContain("x");
  });
});

describe("sorting inside the panel", () => {
  const all = entries(base());
  const ctx = { target: "mars" as const, qualityIds: [] as string[], viewCenter: null };
  const order = (xs: FavEntry[]) => xs.map((e) => e.favourite.id);

  it("by date saved (newest first) and by name", () => {
    expect(order(sortFavourites(all, "date", ctx))).toEqual(["c", "a", "b", "d"]);
    expect(order(sortFavourites(all, "name", ctx))).toEqual(["a", "d", "b", "c"]);
  });

  it("by ranking score for the current filters, non-matching last", () => {
    const r = sortFavourites(all, "score", { ...ctx, qualityIds: ["basaltic_volcanism"] });
    // Kīlauea (strong) > Lanzarote (moderate); McMurdo and the Ries don't match Mars basaltic volcanism.
    expect(order(r).slice(0, 2)).toEqual(["a", "d"]);
  });

  it("by distance from the current view centre", () => {
    const r = sortFavourites(all, "distance", { ...ctx, viewCenter: { lat: 48, lon: 10 } }); // southern Germany
    expect(order(r)[0]).toBe("c");
    expect(order(r).at(-1)).toBe("b"); // Antarctica is farthest
  });

  it("does not mutate its input", () => {
    const copy = [...all];
    sortFavourites(all, "name", ctx);
    expect(all).toEqual(copy);
  });
});

describe("geo", () => {
  it("haversine distance matches known values", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(20015.1, 0);
    expect(haversineKm({ lat: 51.5, lon: -0.12 }, { lat: 48.86, lon: 2.35 })).toBeGreaterThan(330);
    expect(haversineKm({ lat: 51.5, lon: -0.12 }, { lat: 48.86, lon: 2.35 })).toBeLessThan(350);
  });
});
