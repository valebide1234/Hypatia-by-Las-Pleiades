import type { DiscoveryProvider } from "@/discovery/DiscoveryProvider";
import { useDiscovery } from "@/store/discovery";
import { useEngine } from "@/store/engine";
import { useGlobeView } from "@/store/globeView";
import type { AnalogSite, Similarity, Strength, Target } from "@/types/site";
import { coord } from "./format";
import type { Place } from "./types";

export const USER_PROVIDER_ID = "your-places";
const DISPLAY: Record<string, (v: number) => string> = {
  precip_mm_yr: (v) => `${Math.round(v)} mm/yr`,
  tsurf_mean_K: (v) => `${Math.round(v - 273.15)} °C`,
  pressure_Pa: (v) => `${Math.round(v / 1000)} kPa`,
  ctx_uv_index: (v) => v.toFixed(1),
};

/**
 * A place added in the Lab, as a Hypatia candidate for the globe. Its qualities come from the
 * same thresholds the engine uses (exported with its data); with no engine data loaded it
 * carries none.
 */
export function userCandidate(place: Place, target: Target): AnalogSite {
  const rules = useEngine.getState().dataset?.rules ?? {};
  const similarities: Similarity[] = [];
  if (target === "mars") {
    for (const [qualityId, rule] of Object.entries(rules)) {
      const v = place.features[rule.variable];
      if (v === undefined) continue;
      const meets = (limit: number | undefined) => limit !== undefined && (rule.below ? v <= limit : v >= limit);
      const strength: Strength | null = meets(rule.strong) ? "strong" : meets(rule.moderate) ? "moderate" : meets(rule.partial) ? "partial" : null;
      if (!strength) continue;
      const shown = DISPLAY[rule.variable]?.(v) ?? String(v);
      similarities.push({ qualityId, target, strength, explanation: `${shown} over ${place.period ?? "the last ten years"} (NASA POWER, retrieved live for this point${rule.basis === "inferred" ? "; inferred, not measured" : ""}).` });
    }
  }
  return {
    id: `${USER_PROVIDER_ID}:${place.lat.toFixed(3)},${place.lon.toFixed(3)}:${target}`,
    name: place.name.en,
    country: coord(place.lat, place.lon),
    lat: place.lat,
    lon: place.lon,
    origin: "hypatia_candidate",
    programs: [],
    targets: [target],
    summary: `A place you added in the Lab. Its climate was retrieved live from NASA POWER for ${place.period ?? "the last ten years"}; terrain and geology were not retrieved. Open the Lab to compare it with any mission region.`,
    similarities,
    limitations: [
      { target, explanation: "Added by a user, not proposed by the engine's global scan and not recognised by any agency." },
      { target, explanation: "Terrain and geology were not assessed. The climate values describe a reanalysis grid cell about 50 km wide; on a coast they can describe the sea." },
    ],
    researchUse: [],
    images: { earth: [], target: [] },
    references: [],
    discovery: {
      providerId: USER_PROVIDER_ID,
      runAt: place.retrievedAt ?? new Date().toISOString(),
      confidence: similarities.length ? 0.4 : 0.2,
      datasetsUsed: ["NASA POWER (MERRA-2 reanalysis)", "NASA POWER (CERES SYN1deg)"],
      method: "place chosen by the user; climate requested from NASA POWER by the browser; qualities assigned with the engine's thresholds; no terrain, no geology",
      status: "unverified",
    },
  };
}

/** Puts a Lab place on the globe as a candidate and returns the route to open. */
export function showOnGlobe(place: Place, target: Target): string {
  const site = userCandidate(place, target);
  const provider: DiscoveryProvider = { id: USER_PROVIDER_ID, name: "Your places", run: async () => [site] };
  void useDiscovery
    .getState()
    .run(provider, { target, qualityIds: [] })
    .then(() => useGlobeView.getState().requestSelect(site.id));
  return `/explore/${target}`;
}
