import { QUALITY_BY_ID } from "@/data/qualities";
import type { AnalogSite } from "@/types/site";
import type { DiscoveryProvider, DiscoveryQuery } from "./DiscoveryProvider";

export interface CandidateProblem {
  siteId: string;
  problem: string;
}

/**
 * Checks a provider's output before it reaches the globe. Invalid candidates are dropped and
 * reported, never "fixed up", so a provider bug can't silently mislabel a site.
 */
export function validateCandidates(
  provider: DiscoveryProvider,
  query: DiscoveryQuery,
  sites: AnalogSite[],
  reservedIds: ReadonlySet<string>,
): { valid: AnalogSite[]; problems: CandidateProblem[] } {
  const valid: AnalogSite[] = [];
  const problems: CandidateProblem[] = [];
  const seen = new Set<string>();
  for (const s of sites) {
    const fail = (problem: string) => problems.push({ siteId: s?.id ?? "?", problem });
    if (!s || typeof s.id !== "string" || !s.id) {
      fail("missing id");
      continue;
    }
    if (reservedIds.has(s.id) || seen.has(s.id)) {
      fail("id collides with an existing site");
      continue;
    }
    if (s.origin !== "hypatia_candidate") {
      fail(`origin must be "hypatia_candidate" (got "${s.origin}")`);
      continue;
    }
    const d = s.discovery;
    if (!d) {
      fail("missing discovery metadata");
      continue;
    }
    if (d.providerId !== provider.id) {
      fail(`discovery.providerId "${d.providerId}" does not match provider "${provider.id}"`);
      continue;
    }
    if (!(d.confidence >= 0 && d.confidence <= 1)) {
      fail("discovery.confidence must be between 0 and 1");
      continue;
    }
    if (!["unverified", "under_review", "confirmed_by_literature"].includes(d.status)) {
      fail(`unknown discovery.status "${d.status}"`);
      continue;
    }
    if (!(s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180)) {
      fail("invalid coordinates");
      continue;
    }
    if (!s.targets.includes(query.target)) {
      fail(`not a candidate for the queried target (${query.target})`);
      continue;
    }
    const badQuality = [...s.similarities, ...s.limitations].find((x) => x.qualityId && !QUALITY_BY_ID.has(x.qualityId));
    if (badQuality) {
      fail(`unknown quality "${badQuality.qualityId}"`);
      continue;
    }
    seen.add(s.id);
    valid.push(s);
  }
  return { valid, problems };
}
