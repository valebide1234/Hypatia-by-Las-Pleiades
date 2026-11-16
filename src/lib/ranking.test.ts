import { describe, expect, it } from "vitest";
import type { AnalogSite, Limitation, Reference, Similarity, SiteOrigin, Target } from "@/types/site";
import { SITES } from "@/data/sites";
import {
  FIDELITY_BONUS,
  TOP_N,
  fidelity,
  matchSite,
  rankSites,
  relaxationHint,
  scoreMatch,
  strengthSummary,
} from "./ranking";

let n = 0;
function mk(p: {
  name?: string;
  origin?: SiteOrigin;
  targets?: Target[];
  sims?: [string, Target, Similarity["strength"]][];
  lims?: [Target, string?][];
  peer?: number;
}): AnalogSite {
  const id = `s${++n}`;
  return {
    id,
    name: p.name ?? id,
    country: "X",
    lat: 0,
    lon: 0,
    origin: p.origin ?? "literature",
    programs: [],
    targets: p.targets ?? ["mars"],
    summary: "",
    similarities: (p.sims ?? []).map(([qualityId, target, strength]) => ({ qualityId, target, strength, explanation: "" })),
    limitations: (p.lims ?? []).map(([target, qualityId]) => ({ target, qualityId, explanation: "" }) as Limitation),
    researchUse: [],
    images: { earth: [], target: [] },
    references: Array.from({ length: p.peer ?? 0 }, (_, i) => ({ title: `p${i}`, url: `https://x/${i}`, type: "peer_reviewed" }) as Reference),
  };
}

describe("matchSite — rule 1", () => {
  const site = mk({ sims: [["a", "mars", "strong"], ["b", "mars", "partial"], ["c", "moon", "strong"]], targets: ["mars", "moon"] });

  it("matches only when EVERY selected quality is a similarity", () => {
    expect(matchSite(site, "mars", ["a"])).toEqual([{ qualityId: "a", strength: "strong" }]);
    expect(matchSite(site, "mars", ["a", "b"])).toHaveLength(2);
    expect(matchSite(site, "mars", ["a", "zzz"])).toBeNull();
  });

  it("only counts similarities for the selected target", () => {
    expect(matchSite(site, "mars", ["c"])).toBeNull();
    expect(matchSite(site, "moon", ["c"])).toEqual([{ qualityId: "c", strength: "strong" }]);
    expect(matchSite(site, "moon", ["a"])).toBeNull();
  });

  it("never matches a site that is not an analog for the target", () => {
    const marsOnly = mk({ targets: ["mars"], sims: [["a", "moon", "strong"]] });
    expect(matchSite(marsOnly, "moon", ["a"])).toBeNull();
  });

  it("treats duplicate selections as one", () => {
    expect(matchSite(site, "mars", ["a", "a"])).toHaveLength(1);
  });
});

describe("matchSite — limitations always exclude", () => {
  it("a quality listed as a limitation never satisfies that filter, even if also a similarity", () => {
    const contradictory = mk({ sims: [["a", "mars", "strong"], ["b", "mars", "strong"]], lims: [["mars", "a"]] });
    expect(matchSite(contradictory, "mars", ["a"])).toBeNull();
    expect(matchSite(contradictory, "mars", ["b", "a"])).toBeNull();
    expect(matchSite(contradictory, "mars", ["b"])).not.toBeNull();
  });

  it("limitations are target-specific", () => {
    const s = mk({ targets: ["mars", "moon"], sims: [["a", "mars", "strong"], ["a", "moon", "strong"]], lims: [["moon", "a"]] });
    expect(matchSite(s, "mars", ["a"])).not.toBeNull();
    expect(matchSite(s, "moon", ["a"])).toBeNull();
  });

  it("limitations without a qualityId do not exclude anything", () => {
    const s = mk({ sims: [["a", "mars", "strong"]], lims: [["mars"]] });
    expect(matchSite(s, "mars", ["a"])).not.toBeNull();
  });

  it("holds on the real dataset: no ranked site lists a selected quality as a limitation", () => {
    const qs = ["low_biomass", "hyperarid", "extreme_cold", "basaltic_volcanism", "impact_craters"];
    for (const target of ["moon", "mars"] as const) {
      for (const q of qs) {
        for (const r of rankSites(SITES, target, [q])) {
          expect(r.site.limitations.some((l) => l.target === target && l.qualityId === q), `${r.site.id}/${q}`).toBe(false);
          expect(r.site.similarities.some((s) => s.target === target && s.qualityId === q)).toBe(true);
        }
      }
    }
  });
});

describe("scoring", () => {
  it("fidelity is the mean strength of all target similarities divided by 3", () => {
    const s = mk({ sims: [["a", "mars", "strong"], ["b", "mars", "partial"], ["c", "moon", "partial"]], targets: ["mars", "moon"] });
    expect(fidelity(s, "mars")).toBeCloseTo((3 + 1) / 6);
    expect(fidelity(s, "moon")).toBeCloseTo(1 / 3);
    expect(fidelity(mk({}), "mars")).toBe(0);
  });

  it("sums strength weights (3/2/1) plus the fidelity bonus", () => {
    expect(scoreMatch([{ qualityId: "a", strength: "strong" }, { qualityId: "b", strength: "moderate" }, { qualityId: "c", strength: "partial" }], 0.5)).toBeCloseTo(6 + 0.5 * FIDELITY_BONUS);
  });

  it("the fidelity bonus is small: it can reorder equal sums but never beat a higher strength sum", () => {
    expect(FIDELITY_BONUS).toBeLessThan(1 + 1e-9);
    const strongLowFid = mk({ name: "A", sims: [["a", "mars", "strong"], ["x", "mars", "partial"], ["y", "mars", "partial"], ["z", "mars", "partial"]] });
    const moderateHighFid = mk({ name: "B", sims: [["a", "mars", "moderate"]] });
    const r = rankSites([moderateHighFid, strongLowFid], "mars", ["a"]);
    expect(r.map((x) => x.site.name)).toEqual(["A", "B"]);
  });
});

describe("rankSites", () => {
  it("orders by score, then peer-reviewed references, then name, with ranks 1..n", () => {
    const a = mk({ name: "Alpha", sims: [["q", "mars", "moderate"]], peer: 1 });
    const b = mk({ name: "Beta", sims: [["q", "mars", "strong"]], peer: 0 });
    const c = mk({ name: "Charlie", sims: [["q", "mars", "moderate"]], peer: 3 });
    const d = mk({ name: "Delta", sims: [["q", "mars", "moderate"]], peer: 3 });
    const none = mk({ name: "None", sims: [["other", "mars", "strong"]] });
    const r = rankSites([a, b, c, d, none], "mars", ["q"]);
    expect(r.map((x) => x.site.name)).toEqual(["Beta", "Charlie", "Delta", "Alpha"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it("returns all matches, not only the top 10", () => {
    const many = Array.from({ length: 15 }, (_, i) => mk({ name: `S${String(i).padStart(2, "0")}`, sims: [["q", "mars", "strong"]] }));
    const r = rankSites(many, "mars", ["q"]);
    expect(r).toHaveLength(15);
    expect(r.filter((x) => x.rank <= TOP_N)).toHaveLength(10);
  });

  it("ranks Hypatia candidates with the same function, so they can enter the top 10", () => {
    const known = mk({ name: "Known", origin: "nasa_official", sims: [["q", "mars", "moderate"]], peer: 5 });
    const cand = mk({ name: "Candidate", origin: "hypatia_candidate", sims: [["q", "mars", "strong"]] });
    const r = rankSites([known, cand], "mars", ["q"]);
    expect(r[0]!.site.origin).toBe("hypatia_candidate");
    expect(r[0]!.rank).toBe(1);
  });

  it("is deterministic and does not mutate its input", () => {
    const input = [mk({ name: "B", sims: [["q", "mars", "strong"]] }), mk({ name: "A", sims: [["q", "mars", "strong"]] })];
    const copy = [...input];
    expect(rankSites(input, "mars", ["q"]).map((x) => x.site.name)).toEqual(["A", "B"]);
    expect(input).toEqual(copy);
  });

  it("returns an empty list when nothing matches", () => {
    expect(rankSites([mk({ sims: [["a", "mars", "strong"]] })], "mars", ["b"])).toEqual([]);
  });
});

describe("relaxationHint", () => {
  it("suggests the single quality whose removal yields the most matches", () => {
    const s1 = mk({ sims: [["a", "mars", "strong"], ["b", "mars", "strong"]] });
    const s2 = mk({ sims: [["a", "mars", "strong"]] });
    const s3 = mk({ sims: [["a", "mars", "strong"], ["c", "mars", "strong"]] });
    expect(relaxationHint([s1, s2, s3], "mars", ["a", "b", "c"])).toEqual({ drop: "b", matches: 1 }); // ties keep the first
    expect(relaxationHint([s2], "mars", ["b", "c"])).toBeNull(); // no single drop helps
    expect(relaxationHint([s1, s2, s3], "mars", ["a", "z"])).toEqual({ drop: "z", matches: 3 });
  });

  it("returns null for fewer than two qualities", () => {
    expect(relaxationHint([], "mars", ["a"])).toBeNull();
  });
});

describe("strengthSummary", () => {
  it("counts matched strengths in strong→partial order", () => {
    expect(strengthSummary([{ qualityId: "a", strength: "partial" }, { qualityId: "b", strength: "strong" }, { qualityId: "c", strength: "strong" }])).toBe("2 strong · 1 partial");
  });
});
