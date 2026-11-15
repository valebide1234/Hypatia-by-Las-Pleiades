import { describe, expect, it } from "vitest";
import { SITES } from "@/data/sites";
import { rankSites, TOP_N } from "@/lib/ranking";
import { addFavourite, EMPTY_FAV_STATE, favouriteForSite } from "@/lib/favourites";
import type { AnalogSite } from "@/types/site";
import type { DiscoveryProvider } from "./DiscoveryProvider";
import { MOCK_PROVIDER_ID, mockDiscoveryProvider } from "./mockProvider";
import { getDiscoveryProviders } from "./registry";
import { validateCandidates } from "./validateCandidate";
import { useDiscovery } from "@/store/discovery";

const reserved = new Set(SITES.map((s) => s.id));
const query = { target: "mars" as const, qualityIds: ["hyperarid", "low_biomass"] };

describe("mock provider", () => {
  it("returns 2–3 candidates clearly labelled as test data, with complete discovery metadata", async () => {
    const out = await mockDiscoveryProvider.run(query);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(3);
    for (const c of out) {
      expect(c.origin).toBe("hypatia_candidate");
      expect(c.name).toMatch(/TEST DATA/);
      expect(c.summary).toMatch(/TEST DATA/);
      expect(c.discovery).toMatchObject({ providerId: MOCK_PROVIDER_ID, status: "unverified" });
      expect(c.discovery!.confidence).toBeGreaterThanOrEqual(0);
      expect(c.discovery!.confidence).toBeLessThanOrEqual(1);
    }
    expect(validateCandidates(mockDiscoveryProvider, query, out, reserved).problems).toEqual([]);
  });

  it("is removable with a single flag", () => {
    expect(getDiscoveryProviders(true).map((p) => p.id)).toContain(MOCK_PROVIDER_ID);
    expect(getDiscoveryProviders(false).map((p) => p.id)).not.toContain(MOCK_PROVIDER_ID);
  });
});

describe("candidates use the same ranking as catalogued sites", () => {
  it("can enter the top 10, and a candidate listing a selected quality as a limitation is excluded", async () => {
    const candidates = await mockDiscoveryProvider.run(query);
    const r = rankSites([...SITES, ...candidates], "mars", query.qualityIds);
    const ids = r.map((x) => x.site.id);
    expect(ids).toContain("test-candidate-a-mars");
    expect(r.find((x) => x.site.id === "test-candidate-a-mars")!.rank).toBeLessThanOrEqual(TOP_N);
    expect(ids).not.toContain("test-candidate-c-mars"); // lists "hyperarid" as a limitation
    // Known sites are still present and keep the same relative order.
    const known = rankSites(SITES, "mars", query.qualityIds).map((x) => x.site.id);
    expect(ids.filter((id) => known.includes(id))).toEqual(known);
  });

  it("can be saved to favourites like any site", async () => {
    const [c] = await mockDiscoveryProvider.run(query);
    const s = addFavourite(EMPTY_FAV_STATE, { id: "f", siteId: c!.id, note: "", createdAt: "2026-01-01T00:00:00Z" });
    expect(favouriteForSite(s, c!.id)).toBeDefined();
  });
});

describe("validateCandidates", () => {
  const good = async () => (await mockDiscoveryProvider.run(query))[0]!;

  it("rejects wrong origin, missing metadata, bad confidence, id collisions and wrong target", async () => {
    const base = await good();
    const cases: [string, AnalogSite][] = [
      ["origin", { ...base, id: "x1", origin: "nasa_official" }],
      ["metadata", { ...base, id: "x2", discovery: undefined }],
      ["confidence", { ...base, id: "x3", discovery: { ...base.discovery!, confidence: 1.5 } }],
      ["collides", { ...base, id: "haughton-crater" }],
      ["target", { ...base, id: "x5", targets: ["moon"] }],
      ["provider", { ...base, id: "x6", discovery: { ...base.discovery!, providerId: "someone-else" } }],
      ["quality", { ...base, id: "x7", similarities: [{ qualityId: "nope", target: "mars", strength: "strong", explanation: "" }] }],
    ];
    const { valid, problems } = validateCandidates(mockDiscoveryProvider, query, cases.map((c) => c[1]), reserved);
    expect(valid).toEqual([]);
    expect(problems).toHaveLength(cases.length);
  });

  it("rejects duplicate ids within one run", async () => {
    const c = await good();
    const { valid, problems } = validateCandidates(mockDiscoveryProvider, query, [c, { ...c }], reserved);
    expect(valid).toHaveLength(1);
    expect(problems).toHaveLength(1);
  });
});

describe("discovery store", () => {
  it("stores validated candidates, replaces a provider's previous run for the target, and clears", async () => {
    const st = () => useDiscovery.getState();
    st().clear();
    await st().run(mockDiscoveryProvider, query);
    expect(st().candidates).toHaveLength(3);
    await st().run(mockDiscoveryProvider, query);
    expect(st().candidates).toHaveLength(3); // replaced, not duplicated
    await st().run(mockDiscoveryProvider, { target: "moon", qualityIds: ["impact_craters"] });
    expect(st().candidates).toHaveLength(6);
    st().clear();
    expect(st().candidates).toHaveLength(0);
  });

  it("drops invalid candidates and reports them", async () => {
    const bad: DiscoveryProvider = {
      id: "bad",
      name: "Bad",
      run: async () => [{ ...(await mockDiscoveryProvider.run(query))[0]!, origin: "literature" }],
    };
    await useDiscovery.getState().run(bad, query);
    expect(useDiscovery.getState().candidates.filter((c) => c.discovery?.providerId === "bad")).toHaveLength(0);
    expect(useDiscovery.getState().problems.length).toBeGreaterThan(0);
    useDiscovery.getState().clear();
  });

  it("reports provider errors", async () => {
    const failing: DiscoveryProvider = { id: "f", name: "F", run: async () => Promise.reject(new Error("boom")) };
    await useDiscovery.getState().run(failing, query);
    expect(useDiscovery.getState()).toMatchObject({ status: "error", error: "boom" });
    useDiscovery.getState().clear();
  });
});
