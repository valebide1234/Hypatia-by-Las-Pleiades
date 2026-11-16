import type { Text } from "@/i18n";
import type { SiteOrigin, Target } from "@/types/site";

/** Shape of public/engine/lab.json, written by engine/analogs/lab_export.py. */

export type ValueKind = "measured" | "reanalysis" | "modeled" | "derived" | "literature" | "expert_coded" | "physical_zero";
export type CategoryId = "geology" | "topography" | "environment" | "water";

export interface Parameter {
  label: Text;
  category: CategoryId;
  mode: "absolute" | "log" | "ordinal";
  unit: string;
  transform: "identity" | "log10" | "log1p10";
  scale: number | null;
  floor: number | null;
  appliesTo: Target[];
  comparability: Partial<Record<Target, number>>;
  note: Text | null;
}

export interface Objective {
  label: Text;
  description: Text;
  categoryWeights: Record<CategoryId, number>;
  parameterMultipliers: Record<string, number>;
}

export interface Entity {
  id: string;
  lat: number;
  lon: number;
  features: Record<string, number>;
  kinds: Record<string, ValueKind>;
  /** Source key (see sources.references) of each value. */
  src: Record<string, string>;
}

export interface Place extends Entity {
  /**
   * catalogue: in Hypatia's catalogue. proposal: proposed by the team. reference: engine
   * reference site not in the catalogue. candidate: a new place found by the discovery engine
   * and opened in the Lab. user: added in the Lab from live data.
   */
  group: "catalogue" | "proposal" | "reference" | "candidate" | "user";
  name: Text;
  country: Text | null;
  origin?: SiteOrigin;
  targets: Target[];
  summary?: Text | null;
  program?: Text | null;
  notes: string[];
  geologyRefs?: string[];
  /** user places: when the data were retrieved and for which years. */
  retrievedAt?: string;
  period?: string;
}

export interface Region extends Entity {
  target: Target;
  name: Text;
  summary: Text;
  notes: Text | null;
  program: string;
  coordSource: Text | null;
  refs: string[];
}

export interface ScoreCheck {
  place: string;
  region: string;
  objective: string;
  score: number | null;
  coverage: number;
  confidence: number;
  categories: Partial<Record<CategoryId, number>>;
  scored: number;
}

export interface EnvironmentModel {
  trainedAt: string;
  cells: number;
  features: string[];
  silhouette: number;
  explainedVariance: number[];
  loadings: { feature: string; loading: number }[][];
  stability: { kmeans_ari: number; kmeans_ari_min: number; forest_spearman: number; seeds: number };
  trees: number;
  clusters: { id: number; cells: number; pc1: number; pc2: number; rarity: number; name: Text; tsurfMeanC: number; precipMmYr: number; albedo: number }[];
  /** [lat, lon, pc1, pc2, cluster, rarity] for every grid cell. */
  grid: [number, number, number, number, number, number][];
  places: Record<string, { cluster: number; rarity: number; pc1: number; pc2: number; imputed: number }>;
  regions: Record<string, { pc1: number; pc2: number; within: string[]; beyond: string[]; nearest: { lat: number; lon: number; cluster: number; rarity: number; distance: number }[] }>;
}

export interface BodyFacts {
  label: Text;
  gravity: number;
  solarConstant: number;
  solarDayHours: number;
  pressurePa: number | null;
  atmosphere: Text;
  radiation: Text;
}

export interface SourceLink {
  id: string;
  group: "first" | "additional";
  title: string;
  url: string;
  used: "yes" | "partial" | "no";
  endpoint: string;
  what: Text;
  how: Text;
  sources: string[];
  values: number;
  entities: number;
  exampleUrls: string[];
}

export interface LabDataset {
  schema: number;
  generatedAt: string;
  engineVersion: string;
  climatePeriod: { start: number; end: number };
  windowKm: number;
  baselineM: number;
  parameters: Record<string, Parameter>;
  categories: Record<CategoryId, { label: Text; order: number }>;
  objectives: Record<string, Objective>;
  dataQuality: Record<string, number>;
  confidenceLevels: { min: number; label: Text }[];
  places: Place[];
  /** Grid cells of the discovery scan (SI values), so a new candidate can be scored in the Lab. */
  cells?: Record<string, { lat: number; lon: number; features: Record<string, number> }>;
  regions: Region[];
  checks: ScoreCheck[];
  alternative: Record<string, Record<"euclidean" | "mahalanobis" | "cosine", { top: { place: string; score: number }[]; variables: string[]; outOfRange: string[] }>>;
  model: EnvironmentModel | null;
  applications: {
    bodies: Record<"earth" | Target, BodyFacts>;
    notReproducible: Record<Target, { item: Text; why: Text; affects: string[] }[]>;
    feasible: Record<string, Text[]>;
    shared: Record<string, Text>;
    similar: Record<string, Text>;
  };
  sources: {
    links: SourceLink[];
    references: Record<string, { cite: string; url: string; kind: string; page: Text }>;
    missing: { entity: Text; parameter: Text; reason: Text }[];
    otherSources: Record<string, Text>;
    freshness: {
      checkedAt: string | null;
      collections: { shortName: string; title: string; version: string; latest: string | null }[];
      archives: { label: Text; url: string; lastModified: string | null }[];
    };
    valuesStored: number;
  };
}

export const LAB_SCHEMA = 1;
