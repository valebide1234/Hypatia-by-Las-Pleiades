import type { Text } from "@/i18n";
import type { Target } from "@/types/site";
import type { CategoryId, Entity, LabDataset, Parameter, Place, Region, ValueKind } from "./types";

/**
 * The engine's similarity score, re-implemented from engine/analogs/similarity.py so any pair
 * can be compared in the browser. scoring.test.ts checks it against numbers the Python engine
 * exported.
 *
 * For each numeric parameter  d = |f(earth) − f(target)| / scale,  s = exp(−d²/2);
 * for an ordinal geological descriptor  s = 1 − |a − b|,  and joint absence is not scored.
 * Parameters are averaged inside their category with the objective's weights, and categories
 * are combined with the objective's category weights.
 */

export type RowStatus = "scored" | "not_applicable" | "excluded_by_objective" | "missing_earth" | "missing_target" | "joint_absence";

export interface DetailRow {
  parameter: string;
  label: Text;
  category: CategoryId;
  mode: Parameter["mode"];
  unit: string;
  earth: number | null;
  target: number | null;
  earthKind: ValueKind | null;
  targetKind: ValueKind | null;
  status: RowStatus;
  similarity: number | null;
  /** Share of the overall score this parameter can contribute (0 unless scored). */
  effectiveWeight: number;
  /** similarity × effectiveWeight; these add up to the overall score. */
  contribution: number;
}

export interface PairScore {
  score: number | null;
  categoryScores: Partial<Record<CategoryId, number>>;
  categoryCoverage: Partial<Record<CategoryId, number>>;
  categoryWeights: Record<CategoryId, number>;
  coverage: number;
  dataQuality: number | null;
  confidence: number;
  confidenceLabel: Text;
  scored: number;
  missing: number;
  detail: DetailRow[];
}

const CATEGORIES: CategoryId[] = ["geology", "topography", "environment", "water"];
const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

function transform(x: number, how: Parameter["transform"], floor: number): number {
  if (how === "identity") return x;
  if (how === "log10") return Math.log10(Math.max(x, floor));
  return Math.log10(1 + Math.max(x, 0));
}

export function parameterSimilarity(p: Parameter, earth: number, target: number): number {
  if (p.mode === "ordinal") return 1 - Math.abs(earth - target);
  const floor = p.floor ?? 1e-12;
  const d = Math.abs(transform(earth, p.transform, floor) - transform(target, p.transform, floor)) / (p.scale ?? 1);
  return Math.exp(-0.5 * d * d);
}

export function categoryWeights(ds: LabDataset, objectiveId: string): Record<CategoryId, number> {
  const w = ds.objectives[objectiveId]!.categoryWeights;
  const total = CATEGORIES.reduce((s, c) => s + Math.max(w[c] ?? 0, 0), 0);
  return Object.fromEntries(CATEGORIES.map((c) => [c, Math.max(w[c] ?? 0, 0) / total])) as Record<CategoryId, number>;
}

export function scorePair(ds: LabDataset, earth: Entity, region: Entity & { target: Target }, objectiveId: string): PairScore {
  const objective = ds.objectives[objectiveId]!;
  const body = region.target;
  const cw = categoryWeights(ds, objectiveId);
  const weight: Record<string, number> = {};
  const detail: DetailRow[] = [];

  for (const [name, p] of Object.entries(ds.parameters)) {
    const e = earth.features[name];
    const t = region.features[name];
    const row: DetailRow = {
      parameter: name, label: p.label, category: p.category, mode: p.mode, unit: p.unit,
      earth: finite(e) ? e : null, target: finite(t) ? t : null,
      earthKind: earth.kinds[name] ?? null, targetKind: region.kinds[name] ?? null,
      status: "scored", similarity: null, effectiveWeight: 0, contribution: 0,
    };
    const applies = p.appliesTo.includes(body);
    const w = applies ? (objective.parameterMultipliers[name] ?? 1) * (p.comparability[body] ?? 1) : 0;
    if (!applies) row.status = "not_applicable";
    else if (w <= 0) row.status = "excluded_by_objective";
    else if (!finite(e)) row.status = "missing_earth";
    else if (!finite(t)) row.status = "missing_target";
    else if (p.mode === "ordinal" && e === 0 && t === 0) row.status = "joint_absence"; // informative, but not evidence of similarity
    else row.similarity = parameterSimilarity(p, e, t);
    weight[name] = row.status === "not_applicable" || row.status === "excluded_by_objective" ? 0 : w;
    detail.push(row);
  }

  const categoryScores: Partial<Record<CategoryId, number>> = {};
  const categoryCoverage: Partial<Record<CategoryId, number>> = {};
  const categoryQuality: Partial<Record<CategoryId, number>> = {};
  const sum = (rows: DetailRow[]) => rows.reduce((s, r) => s + weight[r.parameter]!, 0);
  for (const c of CATEGORIES) {
    const rows = detail.filter((r) => r.category === c);
    const scored = rows.filter((r) => r.status === "scored");
    const applicable = rows.filter((r) => r.status !== "not_applicable" && r.status !== "excluded_by_objective");
    const have = rows.filter((r) => r.status === "scored" || r.status === "joint_absence");
    const wApplicable = sum(applicable);
    if (wApplicable > 0) categoryCoverage[c] = sum(have) / wApplicable;
    const wScored = sum(scored);
    if (scored.length && wScored > 0) {
      categoryScores[c] = scored.reduce((s, r) => s + r.similarity! * weight[r.parameter]!, 0) / wScored;
      const q = (k: ValueKind | null) => ds.dataQuality[k ?? "measured"] ?? 0.6;
      categoryQuality[c] = scored.reduce((s, r) => s + Math.min(q(r.earthKind), q(r.targetKind)) * weight[r.parameter]!, 0) / wScored;
    }
  }

  const used = CATEGORIES.filter((c) => cw[c] > 0 && categoryScores[c] !== undefined);
  const wsum = used.reduce((s, c) => s + cw[c], 0);
  const score = wsum > 0 ? used.reduce((s, c) => s + categoryScores[c]! * cw[c], 0) / wsum : null;
  const positive = CATEGORIES.filter((c) => cw[c] > 0);
  // Coverage: share of the objective's weight for which data exist on both sides.
  const coverage = positive.reduce((s, c) => s + (categoryCoverage[c] ?? 0) * (used.includes(c) ? cw[c] : 0), 0) / positive.reduce((s, c) => s + cw[c], 0);
  const dataQuality = wsum > 0 ? used.reduce((s, c) => s + categoryQuality[c]! * cw[c], 0) / wsum : null;
  const confidence = dataQuality === null ? 0 : coverage * dataQuality;
  const confidenceLabel = ds.confidenceLevels.find((l) => confidence >= l.min)!.label;

  for (const c of used) {
    const scored = detail.filter((r) => r.category === c && r.status === "scored");
    const ws = sum(scored);
    for (const r of scored) {
      r.effectiveWeight = ((weight[r.parameter]! / ws) * cw[c]) / wsum;
      r.contribution = r.similarity! * r.effectiveWeight;
    }
  }

  return {
    score, categoryScores, categoryCoverage, categoryWeights: cw, coverage, dataQuality, confidence, confidenceLabel,
    scored: detail.filter((r) => r.status === "scored").length,
    missing: detail.filter((r) => r.status === "missing_earth" || r.status === "missing_target").length,
    detail,
  };
}

export interface Ranked {
  place: Place;
  result: PairScore;
}

/** Every place scored against one region, best first. Places with nothing to compare come last. */
export function rankPlaces(ds: LabDataset, places: Place[], region: Region, objectiveId: string): Ranked[] {
  return places
    .map((place) => ({ place, result: scorePair(ds, place, region, objectiveId) }))
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1) || a.place.id.localeCompare(b.place.id));
}

/** Every region of a body scored against one place, best first. */
export function rankRegions(ds: LabDataset, place: Place, target: Target, objectiveId: string): { region: Region; result: PairScore }[] {
  return ds.regions
    .filter((r) => r.target === target)
    .map((region) => ({ region, result: scorePair(ds, place, region, objectiveId) }))
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1));
}

/** Parameters that add most to the score, and those that hold it back most. */
export function explain(result: PairScore, top = 5): { drivers: DetailRow[]; differences: DetailRow[] } {
  const scored = result.detail.filter((r) => r.status === "scored");
  return {
    drivers: [...scored].sort((a, b) => b.contribution - a.contribution).slice(0, top).filter((r) => r.contribution > 0),
    differences: [...scored]
      .sort((a, b) => (1 - b.similarity!) * b.effectiveWeight - (1 - a.similarity!) * a.effectiveWeight)
      .slice(0, top)
      .filter((r) => r.similarity! < 0.75),
  };
}

/** Experiments supported by features the pair actually shares (as engine/analogs/experiments.py). */
export function suggestExperiments(ds: LabDataset, result: PairScore): Text[] {
  const by = new Map(result.detail.map((r) => [r.parameter, r]));
  const out: Text[] = [];
  for (const [key, text] of Object.entries(ds.applications.shared)) {
    const r = by.get(key);
    if (r?.status === "scored" && Math.min(r.earth!, r.target!) >= 0.5) out.push(text);
  }
  for (const [key, text] of Object.entries(ds.applications.similar)) {
    const r = by.get(key);
    if (r?.status === "scored" && r.similarity! >= 0.75) out.push(text);
  }
  return out;
}

/** Objectives that are not one specific kind of test: the balanced one and the user's own weights. */
const isGeneral = (objectiveId: string) => objectiveId === "balanced" || objectiveId === "custom";

export function notReproducible(ds: LabDataset, body: Target, objectiveId: string) {
  const items = ds.applications.notReproducible[body];
  return isGeneral(objectiveId) ? items : items.filter((i) => i.affects.includes(objectiveId));
}

export function feasibleOnEarth(ds: LabDataset, objectiveId: string): Text[] {
  if (!isGeneral(objectiveId)) return ds.applications.feasible[objectiveId] ?? [];
  const seen = new Map<string, Text>();
  for (const list of Object.values(ds.applications.feasible)) for (const x of list) seen.set(x.en, x);
  return [...seen.values()].sort((a, b) => a.en.localeCompare(b.en)).slice(0, 8);
}

/** Display value: ordinal descriptors as words, numbers with sensible precision. */
export function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "0/0.5/1") return value >= 1 ? "dominant" : value >= 0.5 ? "present" : "absent";
  const a = Math.abs(value);
  if (a !== 0 && a < 0.001) return value.toExponential(1);
  if (a >= 1000) return Math.round(value).toLocaleString("en-US");
  if (a >= 100) return value.toFixed(0);
  if (a >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
