import type { Strength, Target } from "@/types/site";

/**
 * Shape of public/engine/discovery.json, written by the Python engine
 * (engine/analogs/hypatia_export.py). See docs/ENGINE.md.
 */

/** How a value or a quality was obtained. Shown next to every engine statement. */
export type EvidenceKind = "measured" | "reanalysis" | "derived" | "inferred";

/** Whether the newest months make a match stronger, weaker or unchanged; "new" = met only in the newest months. */
export type Trend = "stronger" | "weaker" | "same" | "new";

export interface EngineQuality {
  id: string;
  strength: Strength;
  basis: EvidenceKind;
  text: string;
  trend?: Trend;
  /** Value in the newest months and in the months before them, in `unit`. */
  recent?: number | null;
  earlier?: number | null;
  unit?: string;
}

export interface EngineCell {
  lat: number;
  lon: number;
  /** Formatted coordinates, e.g. "22.5°N, 17.5°E". */
  coord: string;
  /** State or province (Natural Earth), and country. */
  place: string | null;
  country: string;
  /** Coarse reading of the climate: permanent ice, humid (probably vegetated), arid, semi-arid or other. */
  surface: "ice" | "humid" | "arid" | "semiarid" | "other";
  nearest: { name: string; km: number; inHypatia: boolean };
  /** Retrieved values keyed as in `valueMeta`, already in display units. */
  values: Record<string, number>;
  /** Mars qualities the retrieved climate supports. */
  qualities: EngineQuality[];
  /** Mars qualities the engine checked and found not met. */
  fails: { id: string; text: string }[];
  /** Mission region whose terrain this cell matches best, per target (cells with terrain only). */
  terrain: Partial<Record<Target, { region: string; topo: number }>>;
  /** Environment type and rarity (0 common, 1 rare) from the engine's unsupervised model. */
  environment?: string;
  rarity?: number;
}

export interface RegionMatch {
  cell: string;
  score: number;
  topo: number | null;
  env: number | null;
  water: number | null;
  confidence: number;
}

export interface MissionRegion {
  id: string;
  target: Target;
  name: string;
  /** Programme or mission the region belongs to, e.g. "Artemis", "Mars 2020". */
  program: string;
  summary: string;
  lat: number;
  lon: number;
  tsurfMeanC: number | null;
  pressurePa: number | null;
  slopeMeanDeg: number | null;
  reliefM: number | null;
  /** Grid cells closest to this region, best first. */
  top: RegionMatch[];
}

export interface SiteCheck {
  qualityId: string;
  target: Target;
  /**
   * confirmed: the catalogue lists the quality and the data support it.
   * new_use: the data support a quality the catalogue does not list for this site.
   * not_supported: the catalogue lists it but the grid-cell value does not meet the threshold.
   */
  status: "confirmed" | "new_use" | "not_supported";
  strength?: Strength;
  basis?: EvidenceKind;
  text?: string;
  trend?: Trend;
  recent?: number | null;
  earlier?: number | null;
  unit?: string;
  /** Terrain checks: the mission region compared and the terrain similarity (0–1). */
  region?: string;
  topo?: number;
}

export interface SiteFinding {
  values: Record<string, number>;
  elevationCorrected?: boolean;
  checks: SiteCheck[];
  /** Closest mission regions per target (environment, water and terrain; no geology). */
  regions: Partial<Record<Target, { id: string; score: number; topo: number | null; confidence: number }[]>>;
  notes: string[];
}

/** A place proposed as an analog by the team behind Hypatia, measured by the engine. */
export interface EngineProposal {
  /** "team:<slug>" */
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  targets: Target[];
  /** under_review: a published study supports the analogy. unverified: the team's proposal only. */
  status: "unverified" | "under_review";
  /** Why the team proposes it, and an optional correction or caveat added while recording it. */
  rationale: { en: string; es: string };
  note?: { en: string; es: string } | null;
  /** Qualities claimed by the proposal or the cited study (not by the engine). */
  proposed: { qualityId: string; targets: Target[]; strength: Strength; evidence: "literature" | "team"; text: { en: string; es: string } }[];
  references: { title: string; url: string; type: "nasa" | "peer_reviewed" | "other" }[];
  surface: EngineCell["surface"];
  values: Record<string, number>;
  /** Mars qualities the engine's data support here, and those it checked and found not met. */
  qualities: EngineQuality[];
  fails: { id: string; text: string }[];
  terrain: Partial<Record<Target, { region: string; topo: number }>>;
}

export interface ValueMeta {
  label: string;
  unit: string;
  kind: EvidenceKind;
  source: string;
  elevationCorrected: boolean;
}

export interface EngineDataset {
  schema: number;
  generatedAt: string;
  engineVersion: string;
  /** Complete calendar years the climate statistics cover. */
  climatePeriod: { start: number; end: number };
  /** The newest published months and the months before them, e.g. "Oct 2023–Sep 2026". */
  windows: { recent?: string; earlier?: string; through?: string; recentMonths?: number; earlierMonths?: number };
  grid: { stepDeg: number; landCells: number; windowKm: number; baselineM: number; nearKnownKm: number };
  freshness: { checkedAt?: string | null; collections: { shortName: string; title: string; latest: string | null }[] };
  datasets: Record<"earth" | Target, string[]>;
  /** Hypatia quality ids the engine can assess from its data, per target. */
  measurable: Record<Target, string[]>;
  rules: Record<string, { variable: string; unit: string; below: boolean; strong?: number; moderate?: number; partial?: number; fail: number; basis: EvidenceKind }>;
  terrainRule: { moderate: number; partial: number; bareGroundMaxPrecip: number };
  valueMeta: Record<string, ValueMeta>;
  regions: MissionRegion[];
  cells: Record<string, EngineCell>;
  /** Places proposed by the team, and those it proposed that were not included, with the reason. */
  proposals?: EngineProposal[];
  declined?: { name: string; reason: { en: string; es: string } }[];
  /** Keyed by Hypatia site id. */
  siteFindings: Record<string, SiteFinding>;
}

export const SUPPORTED_SCHEMA = 1;
