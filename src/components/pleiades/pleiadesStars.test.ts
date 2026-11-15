import { describe, expect, it } from "vitest";
import { PLEIADES, mulberry32, projectCluster, relativeFlux } from "./pleiadesStars";

const byName = (name: string) => projectCluster().find((s) => s.name === name)!;

describe("projectCluster", () => {
  it("keeps every star inside a unit box centred on the cluster", () => {
    for (const s of projectCluster()) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it("draws east to the left and north up, as on a star chart", () => {
    // Atlas has the larger RA (more easterly) than Electra.
    expect(byName("Atlas").x).toBeLessThan(byName("Electra").x);
    // Asterope is the northernmost listed member, Merope the southernmost.
    expect(byName("Asterope").y).toBeLessThan(byName("Merope").y);
  });

  it("returns one projected star per catalogue entry", () => {
    expect(projectCluster()).toHaveLength(PLEIADES.length);
  });
});

describe("relativeFlux", () => {
  it("follows Pogson's ratio (5 magnitudes = 100x)", () => {
    expect(relativeFlux(7.87, 2.87)).toBeCloseTo(0.01, 6);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(45);
    const b = mulberry32(45);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
