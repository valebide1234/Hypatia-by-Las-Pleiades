import { haversineKm } from "@/lib/geo";
import { STRENGTH_WEIGHT } from "@/lib/ranking";
import { TARGET_LABEL, type AnalogSite, type Limitation, type Similarity, type Strength, type Target } from "@/types/site";
import type { DiscoveryQuery } from "../DiscoveryProvider";
import type { EngineCell, EngineDataset, EngineQuality, MissionRegion, RegionMatch, SiteCheck, SiteFinding } from "./types";

export const ENGINE_PROVIDER_ID = "hypatia-engine";
export const TERRAIN_QUALITY = "rover_eva_traversal";
export const DEFAULT_LIMIT = 8;
/** Candidates returned by one run are at least this far apart, so a desert is one pin, not ten. */
export const MIN_SEPARATION_KM = 900;

/** How much each kind of evidence counts towards a candidate's confidence. */
const BASIS_WEIGHT = { measured: 1, reanalysis: 0.85, derived: 0.7, inferred: 0.6 } as const;
/** Confidence is scaled down because geology, the main criterion for an analog, is not assessed. */
const NO_GEOLOGY_FACTOR = 0.6;

const TERRAIN_SOURCE: Record<Target, string> = { moon: "LRO LOLA", mars: "MGS MOLA" };

export const candidateId = (cellId: string, target: Target) => `${ENGINE_PROVIDER_ID}:${cellId}:${target}`;

/** The grid cell behind an engine candidate id, or null for any other site id. */
export function cellIdOf(siteId: string): string | null {
  const parts = siteId.split(":");
  return parts.length === 3 && parts[0] === ENGINE_PROVIDER_ID ? parts[1]! : null;
}

export function regionsFor(ds: EngineDataset, target: Target): MissionRegion[] {
  return ds.regions.filter((r) => r.target === target);
}

export function measurableFor(ds: EngineDataset, target: Target): string[] {
  return ds.measurable[target] ?? [];
}

const isBareGround = (surface: EngineCell["surface"]) => surface === "arid" || surface === "semiarid";

export function terrainStrength(ds: EngineDataset, topo: number | null | undefined): Strength | null {
  if (topo == null) return null;
  if (topo >= ds.terrainRule.moderate) return "moderate";
  if (topo >= ds.terrainRule.partial) return "partial";
  return null;
}

/** Sentence comparing the newest months with the months before them, or "" when there is nothing to say. */
export function trendSentence(ds: EngineDataset, q: Pick<EngineQuality, "trend" | "recent" | "earlier" | "unit">): string {
  if (q.recent == null || q.earlier == null || !ds.windows.recent || !ds.windows.earlier) return "";
  if (q.trend !== "stronger" && q.trend !== "weaker") return "";
  const values = `${q.recent} ${q.unit ?? ""} in ${ds.windows.recent} against ${q.earlier} ${q.unit ?? ""} in ${ds.windows.earlier}`.replace(/\s+/g, " ");
  return q.trend === "stronger" ? ` The newest data make this match closer: ${values}.` : ` The newest data make this match weaker: ${values}.`;
}

/** Sentence naming the terrain evidence for traverse rehearsal against one mission region. */
export function terrainSentence(
  ds: EngineDataset,
  target: Target,
  region: MissionRegion,
  topo: number,
  values: Record<string, number>,
): string {
  const here = [
    values.slope_mean_deg != null ? `mean slope ${values.slope_mean_deg}°` : null,
    values.relief_m != null ? `relief ${values.relief_m} m` : null,
  ].filter(Boolean);
  const there = [
    region.slopeMeanDeg != null ? `${region.slopeMeanDeg}°` : null,
    region.reliefM != null ? `${region.reliefM} m` : null,
  ].filter(Boolean);
  const dry = values.precip_mm_yr != null ? ` The climate is dry (${values.precip_mm_yr} mm/yr), so sparse vegetation is likely but was not verified.` : "";
  return (
    `Inferred from measured terrain: ${here.join(" and ")} here (Copernicus DEM) against ${there.join(" and ")} at ${region.name} ` +
    `(${TERRAIN_SOURCE[target]}), both at a ${ds.grid.baselineM} m baseline over a ${ds.grid.windowKm} km window; terrain similarity ` +
    `${Math.round(topo * 100)}%.${dry} Says nothing about rocks or soil at rover scale.`
  );
}

interface Scored {
  cellId: string;
  cell: EngineCell;
  similarities: Similarity[];
  evidence: EngineQuality["basis"][];
  match?: RegionMatch;
  terrainRegion?: MissionRegion;
  /** Number of qualities that the newest months strengthen or that appear only in them. */
  newer: number;
  order: number;
}

function similaritiesFor(ds: EngineDataset, target: Target, cell: EngineCell, region: MissionRegion | undefined, match: RegionMatch | undefined) {
  const similarities: Similarity[] = [];
  const evidence: EngineQuality["basis"][] = [];
  let newer = 0;
  if (target === "mars") {
    for (const q of cell.qualities) {
      similarities.push({ qualityId: q.id, target, strength: q.strength, explanation: q.text + trendSentence(ds, q) });
      evidence.push(q.basis);
      if (q.trend === "stronger" || q.trend === "new") newer++;
    }
  }
  // Terrain: against the chosen mission region, or else the region this cell matches best.
  const t = region ? (match ? { region: region.id, topo: match.topo } : null) : cell.terrain[target];
  const terrainRegion = t ? ds.regions.find((r) => r.id === t.region) : undefined;
  const strength = t && isBareGround(cell.surface) ? terrainStrength(ds, t.topo) : null;
  if (t?.topo != null && terrainRegion && strength) {
    similarities.push({ qualityId: TERRAIN_QUALITY, target, strength, explanation: terrainSentence(ds, target, terrainRegion, t.topo, cell.values) });
    evidence.push("inferred");
  }
  return { similarities, evidence, newer, terrainRegion: strength ? terrainRegion : undefined };
}

function limitationsFor(ds: EngineDataset, target: Target, cell: EngineCell): Limitation[] {
  const out: Limitation[] = [];
  if (target === "mars") {
    for (const f of cell.fails) out.push({ qualityId: f.id, target, explanation: f.text });
  }
  if (cell.surface === "ice") {
    out.push({ target, explanation: `The surface is permanent snow or ice (albedo ${cell.values.albedo ?? "above 0.5"}): no exposed soil or rock.` });
  } else if (cell.surface === "humid") {
    out.push({ target, explanation: `Humid climate (${cell.values.precip_mm_yr} mm/yr): vegetation cover is likely.` });
  }
  out.push({
    target,
    explanation:
      "Geology was not assessed. The engine retrieves climate and terrain only, so no rock type, mineral or landform is claimed. Check imagery and geological maps before any field use.",
  });
  out.push({
    target,
    explanation: `The values describe a reanalysis grid cell about 50 km wide and a ${ds.grid.windowKm} km terrain window, not a specific outcrop. The pin marks a search area, not a site.`,
  });
  if (target === "mars") {
    const p = cell.values.pressure_Pa;
    out.push({
      target,
      explanation: `Earth's dense atmosphere and magnetic field shield the surface from radiation; Mars has neither.${p != null ? ` Surface pressure here is about ${p} kPa against roughly 0.6 kPa on Mars.` : ""}`,
    });
    out.push({ target, explanation: "Surface gravity is about 2.6 times that of Mars, which changes slope stability, soil behaviour and crew workload." });
    out.push({ target, explanation: "Liquid water and life exist on Earth. Nothing was retrieved about the biology of this place." });
  } else {
    out.push({ target, explanation: "The Moon has no atmosphere: no wind, no weather and no liquid water, and its surface is exposed to vacuum, radiation and micrometeorites." });
    out.push({ target, explanation: "Surface gravity is about six times that of the Moon, which changes soil behaviour, mobility and crew workload." });
    out.push({ target, explanation: "Lunar regolith (agglutinates, space weathering, electrostatically charged dust) has no natural equivalent on Earth. Soil was not assessed here." });
  }
  return out;
}

function summaryFor(ds: EngineDataset, target: Target, s: Scored, region: MissionRegion | undefined): string {
  const { cell, match } = s;
  const parts = [
    `A ${ds.grid.windowKm} km search area around a point of the engine's ${ds.grid.stepDeg}° global grid` +
      (cell.environment ? `, in a ${cell.environment} setting` : "") +
      ".",
    `It is ${cell.nearest.km.toLocaleString("en-US")} km from the nearest known analog (${cell.nearest.name}${cell.nearest.inHypatia ? "" : ", not yet in Hypatia's catalogue"}), so it is proposed as a new place.`,
  ];
  if (region && match) {
    const breakdown = [
      match.topo != null ? `terrain ${Math.round(match.topo * 100)}%` : null,
      match.env != null ? `environment ${Math.round(match.env * 100)}%` : null,
      match.water != null ? `water ${Math.round(match.water * 100)}%` : null,
    ].filter(Boolean);
    parts.push(
      `Compared with ${region.name}: overall similarity ${Math.round(match.score * 100)}% on the measured parameters (${breakdown.join(", ")}). A similarity score ranks places; it does not make this one equivalent to ${TARGET_LABEL[target] === "Moon" ? "the Moon" : "Mars"}.`,
    );
  }
  if (s.newer > 0 && ds.windows.recent) {
    parts.push(`The newest data (${ds.windows.recent}) strengthen ${s.newer === 1 ? "one of its matches" : `${s.newer} of its matches`}.`);
  }
  return parts.join(" ");
}

function confidenceFor(s: Scored): number {
  if (s.match) return Math.min(1, Math.max(0, s.match.confidence));
  if (s.evidence.length === 0) return 0;
  const quality = s.evidence.reduce((sum, b) => sum + BASIS_WEIGHT[b], 0) / s.evidence.length;
  return Math.round(quality * NO_GEOLOGY_FACTOR * 100) / 100;
}

export function methodText(ds: EngineDataset, region: MissionRegion | undefined): string {
  return (
    `${ds.grid.stepDeg}° global land grid (${ds.grid.landCells} cells) described with NASA POWER climate for ` +
    `${ds.climatePeriod.start}–${ds.climatePeriod.end} and Copernicus DEM terrain at a ${ds.grid.baselineM} m baseline; ` +
    `cells within ${ds.grid.nearKnownKm} km of a known analog are excluded; qualities assigned with fixed thresholds` +
    (region ? `; similarity to ${region.name} is the engine's weighted per-parameter score` : "") +
    `; geology not assessed${region ? "" : "; confidence = evidence quality × 0.6"}`
  );
}

export interface BuildOptions {
  limit?: number;
  minSeparationKm?: number;
}

/**
 * Turns the engine's dataset into Hypatia candidates for one query. Pure and synchronous, so
 * it is tested without the network (see engine.test.ts).
 *
 * A cell becomes a candidate only if the data support at least one quality and every requested
 * quality that the engine can measure. Requested qualities it cannot measure (geology, biology,
 * logistics) are ignored for matching and never claimed.
 */
export function buildCandidates(ds: EngineDataset, query: DiscoveryQuery, opts: BuildOptions = {}): AnalogSite[] {
  const target = query.target;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const separation = opts.minSeparationKm ?? MIN_SEPARATION_KM;
  const measurable = new Set(measurableFor(ds, target));
  const requested = [...new Set(query.qualityIds)].filter((q) => measurable.has(q));
  const region = query.missionRegionId ? ds.regions.find((r) => r.id === query.missionRegionId && r.target === target) : undefined;
  if (query.missionRegionId && !region) return [];

  const pool: { cellId: string; match?: RegionMatch }[] = region
    ? region.top.map((m) => ({ cellId: m.cell, match: m }))
    : Object.keys(ds.cells).map((cellId) => ({ cellId }));

  const scored: Scored[] = [];
  for (const { cellId, match } of pool) {
    const cell = ds.cells[cellId];
    if (!cell) continue;
    const { similarities, evidence, newer, terrainRegion } = similaritiesFor(ds, target, cell, region, match);
    if (similarities.length === 0) continue;
    const have = new Map(similarities.map((s) => [s.qualityId, s.strength]));
    if (!requested.every((q) => have.has(q))) continue;
    const counted = requested.length ? requested : [...have.keys()];
    let order = counted.reduce((sum, q) => sum + STRENGTH_WEIGHT[have.get(q)!], 0) / (requested.length ? 1 : counted.length);
    if (match) order += 3 * match.score;
    if (query.preferNewData) order += 2 * newer;
    order += 0.5 * (cell.rarity ?? 0);
    scored.push({ cellId, cell, similarities, evidence, match, terrainRegion, newer, order });
  }
  scored.sort((a, b) => b.order - a.order || a.cellId.localeCompare(b.cellId));

  // Greedy spatial thinning, best first.
  const picked: Scored[] = [];
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (picked.some((p) => haversineKm(p.cell, s.cell) < separation)) continue;
    picked.push(s);
  }

  return picked.map((s) => toSite(ds, target, s, region));
}

function toSite(ds: EngineDataset, target: Target, s: Scored, region: MissionRegion | undefined): AnalogSite {
  const usesTargetData = Boolean(region) || s.similarities.some((x) => x.qualityId === TERRAIN_QUALITY);
  return {
    id: candidateId(s.cellId, target),
    name: `${s.cell.place ?? "Unnamed area"} (${s.cell.coord})`,
    country: s.cell.country,
    lat: s.cell.lat,
    lon: s.cell.lon,
    origin: "hypatia_candidate",
    programs: [],
    targets: [target],
    summary: summaryFor(ds, target, s, region),
    similarities: s.similarities,
    limitations: limitationsFor(ds, target, s.cell),
    researchUse: [],
    images: { earth: [], target: [] },
    references: [],
    discovery: {
      providerId: ENGINE_PROVIDER_ID,
      runAt: ds.generatedAt,
      confidence: confidenceFor(s),
      datasetsUsed: [...ds.datasets.earth, ...(usesTargetData ? ds.datasets[target] : [])],
      method: methodText(ds, region),
      status: "unverified",
    },
  };
}

/**
 * Rebuilds one candidate from its id. Engine ids are deterministic (grid cell + target), so a
 * candidate saved to favourites can be shown again after a reload without repeating the search.
 * Returns null if the id is not an engine id or the current data no longer support the place.
 */
export function candidateFromId(ds: EngineDataset, siteId: string): AnalogSite | null {
  const [provider, cellId, target] = siteId.split(":");
  if (provider !== ENGINE_PROVIDER_ID || !cellId || (target !== "moon" && target !== "mars")) return null;
  const cell = ds.cells[cellId];
  if (!cell) return null;
  const { similarities, evidence, newer, terrainRegion } = similaritiesFor(ds, target, cell, undefined, undefined);
  if (similarities.length === 0) return null;
  return toSite(ds, target, { cellId, cell, similarities, evidence, terrainRegion, newer, order: 0 }, undefined);
}

export interface NewUse {
  siteId: string;
  check: SiteCheck;
}

/** Qualities the data support for catalogued sites but that the catalogue does not list. */
export function newUsesFor(ds: EngineDataset, target: Target, qualityIds: readonly string[] = []): NewUse[] {
  const wanted = new Set(qualityIds);
  const out: NewUse[] = [];
  for (const [siteId, finding] of Object.entries(ds.siteFindings)) {
    for (const check of finding.checks) {
      if (check.status !== "new_use" || check.target !== target) continue;
      if (wanted.size > 0 && !wanted.has(check.qualityId)) continue;
      out.push({ siteId, check });
    }
  }
  return out.sort(
    (a, b) => STRENGTH_WEIGHT[b.check.strength ?? "partial"] - STRENGTH_WEIGHT[a.check.strength ?? "partial"] || a.siteId.localeCompare(b.siteId),
  );
}

/** Explanation of one check on a catalogued site, built from the retrieved numbers. */
export function checkText(ds: EngineDataset, finding: SiteFinding, check: SiteCheck): string {
  if (check.text) return check.text + trendSentence(ds, check);
  const region = check.region ? ds.regions.find((r) => r.id === check.region) : undefined;
  if (region && check.topo != null) return terrainSentence(ds, check.target, region, check.topo, finding.values);
  return "";
}
