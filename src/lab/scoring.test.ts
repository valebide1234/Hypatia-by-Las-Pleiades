import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SITES } from "@/data/sites";
import { explain, feasibleOnEarth, formatValue, notReproducible, rankPlaces, scorePair, suggestExperiments } from "./scoring";
import { LAB_SCHEMA, type LabDataset } from "./types";

const ds = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/lab.json"), "utf8")) as LabDataset;
const place = (id: string) => ds.places.find((p) => p.id === id)!;
const region = (id: string) => ds.regions.find((r) => r.id === id)!;

describe("the browser's similarity score", () => {
  it("reproduces the numbers the Python engine exported, for every sample pair", () => {
    expect(ds.schema).toBe(LAB_SCHEMA);
    expect(ds.checks.length).toBeGreaterThanOrEqual(6);
    for (const c of ds.checks) {
      const r = scorePair(ds, place(c.place), region(c.region), c.objective);
      const label = `${c.place} ↔ ${c.region} (${c.objective})`;
      if (c.score === null) expect(r.score, label).toBeNull();
      else expect(r.score, label).toBeCloseTo(c.score, 5);
      expect(r.coverage, label).toBeCloseTo(c.coverage, 5);
      expect(r.confidence, label).toBeCloseTo(c.confidence, 5);
      expect(r.scored, label).toBe(c.scored);
      for (const [cat, v] of Object.entries(c.categories)) expect(r.categoryScores[cat as keyof typeof r.categoryScores], `${label} ${cat}`).toBeCloseTo(v!, 5);
    }
  });

  it("splits the score into contributions that add up to it", () => {
    const r = scorePair(ds, place("atacama-yungay"), region("jezero_crater"), "balanced");
    expect(r.detail.reduce((s, row) => s + row.contribution, 0)).toBeCloseTo(r.score!, 6);
    const { drivers, differences } = explain(r);
    expect(drivers.length).toBeGreaterThan(0);
    expect(drivers[0]!.contribution).toBeGreaterThanOrEqual(drivers[drivers.length - 1]!.contribution);
    expect(differences.every((d) => d.similarity! < 0.75)).toBe(true);
  });

  it("does not score what does not apply or is missing, and says which", () => {
    const moon = scorePair(ds, place("atacama-yungay"), region("shackleton_south_pole"), "planetary_geology");
    expect(moon.detail.find((r) => r.parameter === "pressure_Pa")!.status).toBe("excluded_by_objective");
    const reef = scorePair(ds, place("aquarius-reef-base"), region("jezero_crater"), "balanced");
    expect(reef.score).toBeNull();
    expect(reef.confidence).toBe(0);
  });

  it("ranks every place for a region, with nothing-to-compare places last", () => {
    const ranked = rankPlaces(ds, ds.places, region("olympia_undae"), "rover_mobility");
    expect(ranked).toHaveLength(ds.places.length);
    expect(ranked[0]!.place.id).toBe("ref:white_sands"); // the published analog for the north polar erg
    expect(ranked[ranked.length - 1]!.result.score).toBeNull();
  });

  it("suggests experiments only from shared features, and lists what Earth cannot reproduce", () => {
    const r = scorePair(ds, place("ref:white_sands"), region("olympia_undae"), "rover_mobility");
    const texts = suggestExperiments(ds, r).map((t) => t.en);
    expect(texts.some((t) => /dunes/i.test(t))).toBe(true);
    expect(notReproducible(ds, "mars", "rover_mobility").some((i) => /gravity/i.test(i.item.en))).toBe(true);
    expect(notReproducible(ds, "mars", "balanced").length).toBeGreaterThanOrEqual(notReproducible(ds, "mars", "rover_mobility").length);
    expect(feasibleOnEarth(ds, "balanced").length).toBeLessThanOrEqual(8);
  });

  it("formats values for reading", () => {
    expect(formatValue(1, "0/0.5/1")).toBe("dominant");
    expect(formatValue(0.5, "0/0.5/1")).toBe("present");
    expect(formatValue(null, "K")).toBe("—");
    expect(formatValue(87510, "Pa")).toBe("87,510");
    expect(formatValue(3e-10, "Pa")).toBe("3.0e-10");
  });
});

describe("the Lab data file", () => {
  it("covers every catalogued site and names only known parameters and sources", () => {
    const catalogue = ds.places.filter((p) => p.group === "catalogue").map((p) => p.id);
    expect(catalogue.sort()).toEqual(SITES.map((s) => s.id).sort());
    for (const e of [...ds.places, ...ds.regions]) {
      for (const k of Object.keys(e.kinds)) expect(k in e.features || !(k in ds.parameters), `${e.id} ${k}`).toBe(true);
      for (const s of Object.values(e.src)) expect(s === "expert_coding" || s in ds.sources.references || s in ds.sources.otherSources, `${e.id} ${s}`).toBe(true);
    }
    expect(ds.model!.grid.length).toBe(ds.model!.cells);
  });
});
