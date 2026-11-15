import type { AnalogSite, Strength, Target } from "@/types/site";

/**
 * Matching and ranking rules (hypatia_claude_code_prompt.md §5). This is the scientific core
 * of the filter feature and is covered by src/lib/ranking.test.ts.
 *
 * Matching: a site matches a set of selected qualities for a target only if
 *   1. the site is an analog for that target,
 *   2. EVERY selected quality appears among the site's similarities for that target, and
 *   3. NONE of the selected qualities appears among the site's limitations for that target.
 *   Rule 3 wins over rule 2: a quality listed as a limitation can never satisfy a filter.
 *
 * Score = Σ strength weight of the selected qualities (strong 3, moderate 2, partial 1)
 *       + FIDELITY_BONUS × fidelity,
 * where fidelity = mean strength weight of ALL the site's similarities for the target ÷ 3
 * (between 1/3 and 1). Ties: more peer-reviewed references first, then name A→Z.
 *
 * Hypatia candidates are ranked by exactly the same function as known sites.
 */

export const STRENGTH_WEIGHT: Record<Strength, number> = { strong: 3, moderate: 2, partial: 1 };
export const FIDELITY_BONUS = 1;
export const TOP_N = 10;

export interface MatchedQuality {
  qualityId: string;
  strength: Strength;
}

export interface RankedSite {
  site: AnalogSite;
  /** 1-based position in the full ranking. */
  rank: number;
  score: number;
  matched: MatchedQuality[];
  fidelity: number;
  peerReviewedCount: number;
}

/** Returns the matched qualities if the site satisfies every selected quality, otherwise null. */
export function matchSite(site: AnalogSite, target: Target, qualityIds: readonly string[]): MatchedQuality[] | null {
  if (!site.targets.includes(target)) return null;
  const limited = new Set(site.limitations.filter((l) => l.target === target && l.qualityId).map((l) => l.qualityId!));
  const matched: MatchedQuality[] = [];
  for (const q of new Set(qualityIds)) {
    if (limited.has(q)) return null;
    // If a quality is (erroneously) listed twice, take the strongest entry.
    const sims = site.similarities.filter((s) => s.target === target && s.qualityId === q);
    if (sims.length === 0) return null;
    const best = sims.reduce((a, b) => (STRENGTH_WEIGHT[b.strength] > STRENGTH_WEIGHT[a.strength] ? b : a));
    matched.push({ qualityId: q, strength: best.strength });
  }
  return matched;
}

/** Mean strength of all the site's similarities for the target, normalised to (0, 1]. 0 if none. */
export function fidelity(site: AnalogSite, target: Target): number {
  const sims = site.similarities.filter((s) => s.target === target);
  if (sims.length === 0) return 0;
  return sims.reduce((sum, s) => sum + STRENGTH_WEIGHT[s.strength], 0) / (sims.length * 3);
}

export function scoreMatch(matched: MatchedQuality[], fid: number): number {
  return matched.reduce((sum, m) => sum + STRENGTH_WEIGHT[m.strength], 0) + FIDELITY_BONUS * fid;
}

export function peerReviewedCount(site: AnalogSite): number {
  return site.references.filter((r) => r.type === "peer_reviewed").length;
}

/**
 * Ranks every matching site. Returns an empty list when nothing matches; callers should treat an
 * empty `qualityIds` as "no filter active" rather than calling this.
 */
export function rankSites(sites: readonly AnalogSite[], target: Target, qualityIds: readonly string[]): RankedSite[] {
  const scored: Omit<RankedSite, "rank">[] = [];
  for (const site of sites) {
    const matched = matchSite(site, target, qualityIds);
    if (!matched) continue;
    const fid = fidelity(site, target);
    scored.push({ site, matched, fidelity: fid, score: scoreMatch(matched, fid), peerReviewedCount: peerReviewedCount(site) });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.peerReviewedCount - a.peerReviewedCount ||
      a.site.name.localeCompare(b.site.name) ||
      a.site.id.localeCompare(b.site.id),
  );
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * When nothing matches, suggests which single selected quality to drop to get the most matches.
 * Returns null if no single removal helps (or fewer than two qualities are selected).
 */
export function relaxationHint(
  sites: readonly AnalogSite[],
  target: Target,
  qualityIds: readonly string[],
): { drop: string; matches: number } | null {
  if (qualityIds.length < 2) return null;
  let best: { drop: string; matches: number } | null = null;
  for (const q of qualityIds) {
    const rest = qualityIds.filter((x) => x !== q);
    const n = sites.filter((s) => matchSite(s, target, rest)).length;
    if (n > 0 && (!best || n > best.matches)) best = { drop: q, matches: n };
  }
  return best;
}

/** Short human summary, e.g. "2 strong · 1 moderate". */
export function strengthSummary(matched: MatchedQuality[]): string {
  const counts: Record<Strength, number> = { strong: 0, moderate: 0, partial: 0 };
  for (const m of matched) counts[m.strength]++;
  return (["strong", "moderate", "partial"] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(" · ");
}
