import type { AnalogSite, Target } from "@/types/site";

/**
 * Plug-in point for discovery engines (hypatia_claude_code_prompt.md §9). A provider compares
 * datasets and proposes NEW analog sites that no agency has catalogued. The Hypatia engine
 * (src/discovery/engine) is registered through it. See docs/DISCOVERY_INTEGRATION.md.
 */
export interface DiscoveryQuery {
  target: Target;
  /** Qualities the user wants to study (ids from data/qualities.json). */
  qualityIds: string[];
  /** Optional search area (WGS84 lon/lat, GeoJSON RFC 7946). */
  region?: GeoJSON.Polygon;
  /**
   * Optional mission need: a lunar or Martian region (id from the engine's dataset, e.g. the
   * Artemis south-pole region or Jezero crater). Providers that support it return the places
   * on Earth closest to that region. Others ignore it.
   */
  missionRegionId?: string;
  /** Put first the places whose match is strengthened by the newest data. */
  preferNewData?: boolean;
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
