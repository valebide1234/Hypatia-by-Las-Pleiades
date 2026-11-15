import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SITES, sitesForTarget, targetImagesFor } from "./sites";
import { QUALITIES, QUALITY_BY_ID, QUALITY_CATEGORIES, qualitiesForTarget } from "./qualities";
import type { ImageRef } from "@/types/site";

const root = resolve(__dirname, "../..");
const missingImagesDoc = readFileSync(resolve(root, "MISSING_IMAGES.md"), "utf8");

describe("quality taxonomy", () => {
  it("has unique ids, known categories and at least one target each", () => {
    const ids = QUALITIES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(QUALITY_CATEGORIES.map((c) => c.id));
    for (const q of QUALITIES) {
      expect(cats.has(q.category)).toBe(true);
      expect(q.targets.length).toBeGreaterThan(0);
      expect(q.description.length).toBeGreaterThan(20);
    }
  });

  it("keeps target-specific qualities out of the other target", () => {
    expect(qualitiesForTarget("moon").map((q) => q.id)).toContain("anorthositic_rock");
    expect(qualitiesForTarget("mars").map((q) => q.id)).not.toContain("anorthositic_rock");
    expect(qualitiesForTarget("moon").map((q) => q.id)).not.toContain("clay_minerals");
  });

  it("every quality is used by at least one site for each of its targets", () => {
    for (const q of QUALITIES) {
      for (const t of q.targets) {
        const used = SITES.some((s) => s.similarities.some((x) => x.qualityId === q.id && x.target === t));
        expect(used, `${q.id} unused for ${t}`).toBe(true);
      }
    }
  });
});

describe("seed dataset", () => {
  it("has at least 25 sites with unique ids and valid coordinates", () => {
    expect(SITES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) {
      expect(s.lat).toBeGreaterThanOrEqual(-90);
      expect(s.lat).toBeLessThanOrEqual(90);
      expect(s.lon).toBeGreaterThanOrEqual(-180);
      expect(s.lon).toBeLessThanOrEqual(180);
      expect(s.targets.length).toBeGreaterThan(0);
      expect(s.summary.length).toBeGreaterThan(40);
    }
  });

  it("similarities reference known qualities that apply to the similarity's target", () => {
    for (const s of SITES) {
      for (const sim of s.similarities) {
        const q = QUALITY_BY_ID.get(sim.qualityId);
        expect(q, `${s.id}: unknown quality ${sim.qualityId}`).toBeDefined();
        expect(q!.targets, `${s.id}: ${sim.qualityId} not valid for ${sim.target}`).toContain(sim.target);
        expect(s.targets).toContain(sim.target);
        expect(sim.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  it("every site lists limitations for each of its targets", () => {
    for (const s of SITES) {
      for (const t of s.targets) {
        expect(s.limitations.filter((l) => l.target === t).length, `${s.id}/${t}`).toBeGreaterThanOrEqual(2);
        expect(s.similarities.filter((x) => x.target === t).length, `${s.id}/${t}`).toBeGreaterThan(0);
      }
    }
  });

  it("never lists the same quality as both a similarity and a limitation for one target", () => {
    for (const s of SITES) {
      for (const lim of s.limitations) {
        if (!lim.qualityId) continue;
        expect(QUALITY_BY_ID.has(lim.qualityId), `${s.id}: unknown ${lim.qualityId}`).toBe(true);
        const clash = s.similarities.some((x) => x.qualityId === lim.qualityId && x.target === lim.target);
        expect(clash, `${s.id}: ${lim.qualityId} is both similarity and limitation`).toBe(false);
      }
    }
  });

  it("official NASA sites cite at least one NASA source; all sites cite something", () => {
    for (const s of SITES) {
      expect(s.references.length, s.id).toBeGreaterThan(0);
      for (const r of s.references) expect(r.url.startsWith("https://"), r.url).toBe(true);
      if (s.origin === "nasa_official") {
        expect(s.references.some((r) => r.type === "nasa"), `${s.id} lacks a NASA reference`).toBe(true);
      }
    }
  });

  it("seed data contains no Hypatia candidates (they come only from discovery providers)", () => {
    expect(SITES.filter((s) => s.origin === "hypatia_candidate")).toHaveLength(0);
  });
});

describe("imagery", () => {
  const all = SITES.flatMap((s) => [...s.images.earth, ...s.images.target].map((img) => ({ site: s, img })));

  it("every image has full provenance metadata and a local file", () => {
    const required: (keyof ImageRef)[] = ["url", "caption", "source", "credit", "license", "sourceUrl"];
    for (const { site, img } of all) {
      for (const k of required) expect(String(img[k] ?? "").trim(), `${site.id}: ${k}`).not.toBe("");
      expect(img.url.startsWith("/images/"), img.url).toBe(true);
      expect(existsSync(resolve(root, "public" + img.url)), img.url).toBe(true);
      expect(img.sourceUrl.startsWith("https://"), img.sourceUrl).toBe(true);
      expect(/public domain|cc0|cc by/i.test(img.license), `${site.id}: licence ${img.license}`).toBe(true);
    }
  });

  it("target-tagged images belong to one of the site's targets", () => {
    for (const s of SITES) for (const img of s.images.target) if (img.target) expect(s.targets).toContain(img.target);
  });

  it("each site has an Earth image, and each target either has an image or is logged in MISSING_IMAGES.md", () => {
    for (const s of SITES) {
      expect(s.images.earth.length, s.id).toBeGreaterThan(0);
      for (const t of s.targets) {
        if (targetImagesFor(s, t).length === 0) {
          expect(missingImagesDoc.includes(`\`${s.id}\``), `${s.id}/${t} missing and not logged`).toBe(true);
        }
      }
    }
  });
});

describe("sitesForTarget", () => {
  it("returns only sites that list the target, and dual-target sites in both", () => {
    for (const s of sitesForTarget(SITES, "moon")) expect(s.targets).toContain("moon");
    for (const s of sitesForTarget(SITES, "mars")) expect(s.targets).toContain("mars");
    const both = SITES.filter((s) => s.targets.length === 2);
    expect(both.length).toBeGreaterThan(0);
    for (const s of both) {
      expect(sitesForTarget(SITES, "moon")).toContain(s);
      expect(sitesForTarget(SITES, "mars")).toContain(s);
    }
  });
});
