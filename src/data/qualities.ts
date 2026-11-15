import raw from "../../data/qualities.json";
import type { Quality, QualityCategory, Target } from "@/types/site";

export const QUALITY_CATEGORIES = raw.categories as { id: QualityCategory; label: string }[];
export const QUALITIES = raw.qualities as Quality[];
export const QUALITY_BY_ID: ReadonlyMap<string, Quality> = new Map(QUALITIES.map((q) => [q.id, q]));

/** Qualities relevant to a target, in data-file order. */
export function qualitiesForTarget(target: Target, qualities: Quality[] = QUALITIES): Quality[] {
  return qualities.filter((q) => q.targets.includes(target));
}
