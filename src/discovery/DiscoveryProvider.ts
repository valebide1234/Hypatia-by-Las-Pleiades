import type { AnalogSite, Target } from "@/types/site";

/**
 * Plug-in point for the future Hypatia discovery engine (hypatia_claude_code_prompt.md §9).
 * A provider compares datasets and proposes NEW analog sites that no agency has catalogued.
 * See docs/DISCOVERY_INTEGRATION.md.
 */
export interface DiscoveryQuery {
  target: Target;
  /** Qualities the user wants to study (ids from data/qualities.json). */
  qualityIds: string[];
  /** Optional search area (WGS84 lon/lat, GeoJSON RFC 7946). */
  region?: GeoJSON.Polygon;
}

export interface DiscoveryProvider {
  /** Stable id; stored in each candidate's `discovery.providerId`. */
  id: string;
  /** Human-readable name shown in the Discover panel. */
  name: string;
  /** True for providers that return synthetic data (shown with a TEST DATA label). */
  isTestData?: boolean;
  /**
   * Runs a discovery. Must resolve to sites with `origin: "hypatia_candidate"` and a complete
   * `discovery` block. Candidates are ranked with exactly the same function as catalogued sites.
   */
  run(query: DiscoveryQuery, signal?: AbortSignal): Promise<AnalogSite[]>;
}
