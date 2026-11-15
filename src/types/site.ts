// Core data model (see hypatia_claude_code_prompt.md §8). Mirrors the Supabase schema.

export type Target = "moon" | "mars";
export type SiteOrigin = "nasa_official" | "literature" | "hypatia_candidate";
export type Strength = "strong" | "moderate" | "partial";

export const TARGETS: Target[] = ["moon", "mars"];
export const isTarget = (v: unknown): v is Target => v === "moon" || v === "mars";

export interface ImageRef {
  /** Path under /public (downloaded copy) — never a hot-link. */
  url: string;
  caption: string;
  source: string;
  instrument?: string;
  date?: string;
  credit: string;
  license: string;
  /** Page the image was taken from (licence and provenance). */
  sourceUrl: string;
  /** For target-body images on dual-target sites: which body this image shows. */
  target?: Target;
}

export interface Similarity {
  qualityId: string;
  target: Target;
  strength: Strength;
  explanation: string;
}

export interface Limitation {
  qualityId?: string;
  target: Target;
  explanation: string;
}

export interface Reference {
  title: string;
  url: string;
  type: "nasa" | "peer_reviewed" | "other";
}

/** Metadata for sites proposed by a discovery provider (§9). */
export interface DiscoveryMeta {
  providerId: string;
  runAt: string;
  confidence: number; // 0–1
  datasetsUsed: string[];
  method: string;
  status: "unverified" | "under_review" | "confirmed_by_literature";
}

export interface AnalogSite {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  origin: SiteOrigin;
  programs: string[];
  targets: Target[];
  summary: string;
  similarities: Similarity[];
  limitations: Limitation[];
  researchUse: string[];
  images: { earth: ImageRef[]; target: ImageRef[] };
  references: Reference[];
  discovery?: DiscoveryMeta;
}

export const ORIGIN_LABEL: Record<SiteOrigin, string> = {
  nasa_official: "Official NASA analog",
  literature: "Literature analog",
  hypatia_candidate: "Hypatia candidate",
};

export const TARGET_LABEL: Record<Target, string> = { moon: "Moon", mars: "Mars" };

export type QualityCategory = "geology" | "environment" | "operational";

export interface Quality {
  id: string;
  label: string;
  category: QualityCategory;
  /** Bodies for which this quality is meaningful; the filter bar only shows these. */
  targets: Target[];
  /** Scientific justification shown in tooltips. */
  description: string;
}
