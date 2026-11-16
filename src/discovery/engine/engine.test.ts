import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUALITY_BY_ID } from "@/data/qualities";
import { SITES } from "@/data/sites";
import { haversineKm } from "@/lib/geo";
import { rankSites } from "@/lib/ranking";
import { validateCandidates } from "../validateCandidate";
import { ENGINE_PROVIDER_ID, TERRAIN_QUALITY, buildCandidates, candidateFromId, candidateId, cellIdOf, newUsesFor, trendSentence } from "./buildCandidates";
import { hypatiaEngineProvider } from "./engineProvider";
import { TEAM_PROVIDER_ID, isTeamProposal, proposalSites } from "./proposals";
import { SUPPORTED_SCHEMA, type EngineCell, type EngineDataset } from "./types";

const cell = (over: Partial<EngineCell>): EngineCell => ({
  lat: 0,
  lon: 0,
  coord: "0.0°N, 0.0°E",
  place: "Somewhere",
  country: "Nowhere",
  surface: "arid",
  nearest: { name: "Known site", km: 1200, inHypatia: true },
  values: { precip_mm_yr: 12, pressure_Pa: 90, slope_mean_deg: 1.2, relief_m: 200 },
  qualities: [],
  fails: [],
  terrain: {},
  ...over,
});

const hyperarid = (strength: "strong" | "moderate" | "partial", trend: "same" | "stronger" = "same") => ({
  id: "hyperarid",
  strength,
  basis: "reanalysis" as const,
  text: "Mean precipitation 12 mm/yr.",
  trend,
  recent: 8,
  earlier: 14,
  unit: "mm/yr",
});

/** Small hand-made dataset: four cells far apart, one Mars region. */
const DS: EngineDataset = {
  schema: SUPPORTED_SCHEMA,
  generatedAt: "2026-11-15T00:00:00Z",
  engineVersion: "test",
  climatePeriod: { start: 2016, end: 2025 },
  windows: { recent: "Oct 2023–Sep 2026", earlier: "Oct 2016–Sep 2023", through: "2026-09" },
  grid: { stepDeg: 5, landCells: 4, windowKm: 40, baselineM: 463, nearKnownKm: 300 },
  freshness: { collections: [] },
  datasets: { earth: ["NASA POWER"], moon: ["LRO LOLA"], mars: ["MGS MOLA"] },
  measurable: { mars: ["hyperarid", "extreme_cold", TERRAIN_QUALITY], moon: [TERRAIN_QUALITY] },
  rules: {},
  terrainRule: { moderate: 0.85, partial: 0.65, bareGroundMaxPrecip: 300 },
  valueMeta: {},
  regions: [
    {
      id: "jezero",
      target: "mars",
      name: "Jezero crater",
      program: "Mars 2020",
      summary: "A delta.",
      lat: 18,
      lon: 77,
      tsurfMeanC: -50,
      pressurePa: 720,
      slopeMeanDeg: 2.4,
      reliefM: 775,
      top: [
        { cell: "dry", score: 0.6, topo: 0.9, env: 0.3, water: 0.8, confidence: 0.5 },
        { cell: "wet", score: 0.5, topo: 0.95, env: 0.3, water: 0.2, confidence: 0.5 },
      ],
    },
    { id: "shackleton", target: "moon", name: "Shackleton crater", program: "Artemis", summary: "A polar crater.", lat: -89.7, lon: 129.8, tsurfMeanC: -207, pressurePa: 0, slopeMeanDeg: 13, reliefM: 3185, top: [] },
  ],
  cells: {
    dry: cell({ lat: 20, lon: 20, qualities: [hyperarid("strong")], terrain: { mars: { region: "jezero", topo: 0.9 }, moon: { region: "shackleton", topo: 0.9 } } }),
    drier: cell({ lat: -20, lon: 120, qualities: [hyperarid("moderate", "stronger")] }),
    cold: cell({
      lat: 70,
      lon: -40,
      surface: "ice",
      qualities: [{ id: "extreme_cold", strength: "strong", basis: "reanalysis", text: "Cold." }],
      fails: [{ id: "hyperarid", text: "Checked and not met." }],
    }),
    wet: cell({ lat: 0, lon: -60, surface: "humid", terrain: { mars: { region: "jezero", topo: 0.95 }, moon: { region: "shackleton", topo: 0.95 } } }),
  },
  siteFindings: {
    "atacama-yungay": {
      values: { precip_mm_yr: 9 },
      checks: [
        { qualityId: "hyperarid", target: "mars", status: "confirmed", strength: "strong", basis: "reanalysis", text: "9 mm/yr." },
        { qualityId: TERRAIN_QUALITY, target: "mars", status: "new_use", strength: "moderate", basis: "inferred", region: "jezero", topo: 0.9 },
      ],
      regions: { mars: [{ id: "jezero", score: 0.5, topo: 0.9, confidence: 0.5 }] },
      notes: [],
    },
  },
};

const reserved = new Set(SITES.map((s) => s.id));
const ids = (sites: { id: string }[]) => sites.map((s) => cellIdOf(s.id));

describe("buildCandidates", () => {
  it("returns only places whose data support every requested quality the engine can measure", () => {
    expect(ids(buildCandidates(DS, { target: "mars", qualityIds: ["hyperarid"] }))).toEqual(["dry", "drier"]);
    expect(ids(buildCandidates(DS, { target: "mars", qualityIds: ["hyperarid", "extreme_cold"] }))).toEqual([]);
  });

  it("ignores qualities it cannot measure and never claims them", () => {
    const out = buildCandidates(DS, { target: "mars", qualityIds: ["hyperarid", "clay_minerals"] });
    expect(ids(out)).toEqual(["dry", "drier"]);
    expect(out.flatMap((c) => c.similarities.map((s) => s.qualityId))).not.toContain("clay_minerals");
    // ...so the globe filter on that quality still excludes them.
    expect(rankSites(out, "mars", ["hyperarid", "clay_minerals"])).toEqual([]);
  });

  it("produces candidates that pass the app's validation, with stable ids", () => {
    const query = { target: "mars" as const, qualityIds: [] };
    const out = buildCandidates(DS, query);
    expect(validateCandidates(hypatiaEngineProvider, query, out, reserved).problems).toEqual([]);
    expect(out[0]!.id).toBe(candidateId(cellIdOf(out[0]!.id)!, "mars"));
    expect(out.every((c) => c.discovery?.providerId === ENGINE_PROVIDER_ID && c.discovery.status === "unverified")).toBe(true);
    expect(out.every((c) => c.images.earth.length === 0 && c.references.length === 0)).toBe(true);
  });

  it("claims traverse rehearsal only from terrain, only on bare ground, and never as strong", () => {
    const moon = buildCandidates(DS, { target: "moon", qualityIds: [] });
    expect(ids(moon)).toEqual(["dry"]); // "wet" has matching terrain but a humid climate
    const sim = moon[0]!.similarities.find((s) => s.qualityId === TERRAIN_QUALITY)!;
    expect(sim.strength).toBe("moderate");
    expect(sim.explanation).toMatch(/Inferred from measured terrain/);
  });

  it("compares with a mission region and reports the engine's own confidence", () => {
    const out = buildCandidates(DS, { target: "mars", qualityIds: [], missionRegionId: "jezero" });
    expect(ids(out)).toEqual(["dry"]); // "wet" is in the region's list but supports no quality
    expect(out[0]!.summary).toMatch(/Compared with Jezero crater: overall similarity 60%/);
    expect(out[0]!.summary).toMatch(/does not make this one equivalent/);
    expect(out[0]!.discovery!.confidence).toBe(0.5);
    expect(buildCandidates(DS, { target: "moon", qualityIds: [], missionRegionId: "jezero" })).toEqual([]);
  });

  it("can put first the places that the newest data strengthen, and says so", () => {
    const out = buildCandidates(DS, { target: "mars", qualityIds: ["hyperarid"], preferNewData: true });
    expect(ids(out)).toEqual(["drier", "dry"]);
    expect(out[0]!.similarities[0]!.explanation).toMatch(/newest data make this match closer: 8 mm\/yr in Oct 2023–Sep 2026 against 14 mm\/yr/);
    expect(trendSentence(DS, { trend: "same", recent: 1, earlier: 1 })).toBe("");
  });

  it("reports qualities it checked and found not met as limitations, which exclude the candidate", () => {
    const out = buildCandidates(DS, { target: "mars", qualityIds: ["extreme_cold"] });
    expect(ids(out)).toEqual(["cold"]);
    expect(out[0]!.limitations.some((l) => l.qualityId === "hyperarid")).toBe(true);
    expect(out[0]!.limitations.some((l) => /Geology was not assessed/.test(l.explanation))).toBe(true);
    expect(out[0]!.limitations.some((l) => /permanent snow or ice/.test(l.explanation))).toBe(true);
  });

  it("keeps candidates apart so one desert is not ten pins", () => {
    const near: EngineDataset = { ...DS, cells: { ...DS.cells, twin: cell({ lat: 21, lon: 21, qualities: [hyperarid("moderate")] }) } };
    expect(ids(buildCandidates(near, { target: "mars", qualityIds: ["hyperarid"] }))).not.toContain("twin");
    expect(ids(buildCandidates(near, { target: "mars", qualityIds: ["hyperarid"] }, { minSeparationKm: 0 }))).toContain("twin");
  });
});

describe("places proposed by the team", () => {
  const real = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/discovery.json"), "utf8")) as EngineDataset;
  const tr = (text: string) => text;
  const sites = proposalSites(real, "en", tr);

  it("are shown as candidates, never as official analogs, and name only known qualities", () => {
    expect(sites.length).toBeGreaterThanOrEqual(10);
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    for (const s of sites) {
      expect(s.origin).toBe("hypatia_candidate");
      expect(s.discovery).toMatchObject({ providerId: TEAM_PROVIDER_ID });
      expect(isTeamProposal(s.id) && !reserved.has(s.id)).toBe(true);
      for (const x of [...s.similarities, ...s.limitations]) if (x.qualityId) expect(QUALITY_BY_ID.has(x.qualityId), `${s.id} ${x.qualityId}`).toBe(true);
      for (const x of s.similarities) expect(s.targets).toContain(x.target);
    }
  });

  it("say where each claim comes from, and never rate a proposed quality as strong", () => {
    for (const p of real.proposals!) {
      for (const q of p.proposed) expect(q.strength, `${p.id} ${q.qualityId}`).not.toBe("strong");
      expect(p.status === "under_review" ? p.references.length : 1, p.id).toBeGreaterThan(0);
    }
    const diamante = sites.find((s) => s.id === "team:laguna-diamante")!;
    expect(diamante.similarities.find((x) => x.qualityId === "microbialites_biosignatures")!.explanation).toMatch(/From the cited study; not verified by the engine/);
    expect(diamante.similarities.find((x) => x.qualityId === "high_uv")!.explanation).toMatch(/^Measured by the engine:/);
    expect(diamante.summary).toMatch(/Catamarca/);
    // A quality the engine checked and found not met excludes the proposal from that filter.
    expect(rankSites(sites, "mars", ["hyperarid"]).some((r) => r.site.id === "team:lencois-maranhenses")).toBe(false);
    expect(rankSites(sites, "mars", ["impact_craters"]).map((r) => r.site.id)).toEqual(expect.arrayContaining(["team:domo-araguainha", "team:domo-vargeao"]));
  });
});

describe("candidateFromId", () => {
  it("rebuilds a saved candidate from its id, and only for places the data still support", () => {
    const [first] = buildCandidates(DS, { target: "mars", qualityIds: ["hyperarid"] });
    expect(candidateFromId(DS, first!.id)).toEqual(first);
    expect(candidateFromId(DS, candidateId("wet", "mars"))).toBeNull(); // supports no quality
    expect(candidateFromId(DS, candidateId("gone", "mars"))).toBeNull();
    expect(candidateFromId(DS, "haughton-crater")).toBeNull();
  });
});

describe("new uses for catalogued sites", () => {
  it("lists only qualities the catalogue does not have, optionally for the selected qualities", () => {
    expect(newUsesFor(DS, "mars").map((u) => [u.siteId, u.check.qualityId])).toEqual([["atacama-yungay", TERRAIN_QUALITY]]);
    expect(newUsesFor(DS, "mars", ["hyperarid"])).toEqual([]);
    expect(newUsesFor(DS, "moon")).toEqual([]);
  });
});

describe("the engine data file shipped with the app", () => {
  const ds = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/discovery.json"), "utf8")) as EngineDataset;

  it("has the schema this app reads and names only known qualities, sites and regions", () => {
    expect(ds.schema).toBe(SUPPORTED_SCHEMA);
    for (const q of [...ds.measurable.moon, ...ds.measurable.mars, ...Object.keys(ds.rules)]) expect(QUALITY_BY_ID.has(q), q).toBe(true);
    const proposalIds = new Set((ds.proposals ?? []).map((p) => p.id));
    for (const id of Object.keys(ds.siteFindings)) expect(reserved.has(id) || proposalIds.has(id), id).toBe(true);
    const regionIds = new Set(ds.regions.map((r) => r.id));
    for (const r of ds.regions) for (const m of r.top) expect(m.cell in ds.cells, m.cell).toBe(true);
    for (const c of Object.values(ds.cells)) for (const t of Object.values(c.terrain)) expect(regionIds.has(t!.region)).toBe(true);
  });

  it("yields valid candidates for both targets, none of them near a catalogued site", () => {
    for (const target of ["moon", "mars"] as const) {
      const query = { target, qualityIds: [] };
      const out = buildCandidates(ds, query, { limit: 50, minSeparationKm: 0 });
      expect(out.length, target).toBeGreaterThan(0);
      expect(validateCandidates(hypatiaEngineProvider, query, out, reserved).problems).toEqual([]);
      for (const c of out) {
        const nearest = Math.min(...SITES.map((s) => haversineKm(c, s)));
        expect(nearest, c.name).toBeGreaterThanOrEqual(ds.grid.nearKnownKm - 1);
      }
    }
  });

  it("never suggests as new a quality the catalogue already lists or rules out", () => {
    for (const [siteId, f] of Object.entries(ds.siteFindings)) {
      const site = SITES.find((s) => s.id === siteId);
      if (!site) continue; // a team proposal: not in the catalogue, so nothing to compare with
      for (const c of f.checks.filter((x) => x.status === "new_use")) {
        expect(site.targets).toContain(c.target);
        expect(site.similarities.some((s) => s.target === c.target && s.qualityId === c.qualityId), `${siteId} ${c.qualityId}`).toBe(false);
        expect(site.limitations.some((l) => l.target === c.target && l.qualityId === c.qualityId), `${siteId} ${c.qualityId}`).toBe(false);
      }
    }
  });
});
