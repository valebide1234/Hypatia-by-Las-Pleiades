import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepo } from "@/data/repo/localRepo";
import { foldersOf, isUnfiled } from "@/lib/favourites";
import { useUserData } from "./userData";

const st = () => useUserData.getState();

describe("user data store (local repository)", () => {
  beforeEach(async () => {
    localStorage.clear();
    await st().connect(createLocalRepo("test.key"));
  });

  it("saves a favourite with folders and persists it", async () => {
    const folder = await st().createFolder("Volcanic");
    await st().saveFavourite("kilauea-iki", "note", [folder.id]);
    const fav = st().fav.favourites[0]!;
    expect(foldersOf(st().fav, fav.id).map((f) => f.name)).toEqual(["Volcanic"]);
    // Reconnect: data comes back from storage.
    await st().connect(createLocalRepo("test.key"));
    expect(st().fav.favourites).toHaveLength(1);
    expect(st().fav.items).toHaveLength(1);
  });

  it("saving an already saved site updates note and folders instead of duplicating", async () => {
    const a = await st().createFolder("A");
    const b = await st().createFolder("B");
    await st().saveFavourite("lanzarote", "", [a.id]);
    await st().saveFavourite("lanzarote", "lava tube", [b.id]);
    expect(st().fav.favourites).toHaveLength(1);
    const fav = st().fav.favourites[0]!;
    expect(fav.note).toBe("lava tube");
    expect(foldersOf(st().fav, fav.id).map((f) => f.name)).toEqual(["B"]);
  });

  it("remove offers undo that restores folder membership", async () => {
    const a = await st().createFolder("A");
    await st().saveFavourite("lonar-crater", "", [a.id]);
    const id = st().fav.favourites[0]!.id;
    await st().removeFavourite(id);
    expect(st().fav.favourites).toHaveLength(0);
    expect(st().lastRemoved?.favourite.id).toBe(id);
    await st().undoRemove();
    expect(foldersOf(st().fav, id).map((f) => f.name)).toEqual(["A"]);
    await st().connect(createLocalRepo("test.key"));
    expect(st().fav.items).toHaveLength(1);
  });

  it("deleting a folder keeps favourites (they become unfiled)", async () => {
    const a = await st().createFolder("A");
    await st().saveFavourite("dallol-danakil", "", [a.id]);
    await st().deleteFolder(a.id);
    await st().connect(createLocalRepo("test.key"));
    expect(st().fav.favourites).toHaveLength(1);
    expect(isUnfiled(st().fav, st().fav.favourites[0]!.id)).toBe(true);
  });

  it("move and reorder persist", async () => {
    const a = await st().createFolder("A");
    const b = await st().createFolder("B");
    await st().saveFavourite("sudbury", "", [a.id]);
    const id = st().fav.favourites[0]!.id;
    await st().moveFavourite(id, a.id, b.id);
    await st().shiftFolder(b.id, -1);
    await st().connect(createLocalRepo("test.key"));
    expect(foldersOf(st().fav, id).map((f) => f.name)).toEqual(["B"]);
    expect([...st().fav.folders].sort((x, y) => x.sortOrder - y.sortOrder).map((f) => f.name)).toEqual(["B", "A"]);
  });

  it("saves and deletes searches", async () => {
    await st().saveSearch("mars", ["hyperarid", "low_biomass"], "Dry & sterile");
    await st().connect(createLocalRepo("test.key"));
    expect(st().searches[0]).toMatchObject({ target: "mars", qualityIds: ["hyperarid", "low_biomass"], name: "Dry & sterile" });
    await st().deleteSearch(st().searches[0]!.id);
    expect(st().searches).toHaveLength(0);
  });
});
