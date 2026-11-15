import type { AnalogSite, Limitation, Similarity, Strength, Target } from "@/types/site";

export const STRENGTH_ORDER: Record<Strength, number> = { strong: 0, moderate: 1, partial: 2 };

/** Similarities for one target, strongest first (stable within a strength). */
export function similaritiesFor(site: AnalogSite, target: Target): Similarity[] {
  return site.similarities
    .filter((s) => s.target === target)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => STRENGTH_ORDER[a.s.strength] - STRENGTH_ORDER[b.s.strength] || a.i - b.i)
    .map(({ s }) => s);
}

export function limitationsFor(site: AnalogSite, target: Target): Limitation[] {
  return site.limitations.filter((l) => l.target === target);
}

export function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`;
}

export const REFERENCE_ORDER = { nasa: 0, peer_reviewed: 1, other: 2 } as const;
