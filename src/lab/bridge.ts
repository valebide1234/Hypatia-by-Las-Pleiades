import { cellIdOf } from "@/discovery/engine/buildCandidates";
import { tx } from "@/i18n";
import { useEngine } from "@/store/engine";
import { useGlobeView } from "@/store/globeView";
import { useUi } from "@/store/ui";
import type { Target } from "@/types/site";
import { kindOf } from "./livePlace";
import { rankRegions } from "./scoring";
import { allPlaces, useLab } from "./store";
import type { LabDataset, Place, ValueKind } from "./types";
import { USER_PROVIDER_ID } from "./userCandidate";

/**
 * Links between the globe and the Lab: the same place and the same mission region can be
 * opened on either side, so a finding made in one is carried to the other.
 */

const TERRAIN_KEYS = new Set(["relief_m", "slope_mean_deg", "slope_p95_deg", "roughness_tri_m", "ctx_elevation_mean_m"]);

/** A grid cell of the discovery scan as a Lab place, with the engine's own values. */
export function candidatePlace(lab: LabDataset, cellId: string): Place | null {
  const cell = lab.cells?.[cellId];
  if (!cell) return null;
  const info = useEngine.getState().dataset?.cells[cellId];
  const kinds: Record<string, ValueKind> = {};
  const src: Record<string, string> = {};
  for (const k of Object.keys(cell.features)) {
    kinds[k] = TERRAIN_KEYS.has(k) ? "measured" : kindOf(k);
    src[k] = TERRAIN_KEYS.has(k) ? "copernicus_dem" : "nasa_power";
  }
  return {
    id: `cell:${cellId}`,
    group: "candidate",
    name: { en: info ? `${info.place ?? "Unnamed area"} (${info.coord})` : cellId },
    country: info ? { en: info.country } : null,
    lat: cell.lat,
    lon: cell.lon,
    origin: "hypatia_candidate",
    targets: ["moon", "mars"],
    features: cell.features,
    kinds,
    src,
    notes: [tx("A new candidate from the discovery engine: a search area on its global grid, not a site. Geological descriptors are not coded, so geology is not scored.")],
  };
}

/** The Lab place that stands for a site of the globe, or null when the Lab has no data for it. */
export function labPlaceForSite(lab: LabDataset, siteId: string): Place | null {
  const { userPlaces, candidatePlaces } = useLab.getState();
  const cellId = cellIdOf(siteId);
  if (cellId) return candidatePlaces.find((p) => p.id === `cell:${cellId}`) ?? candidatePlace(lab, cellId);
  if (siteId.startsWith(`${USER_PROVIDER_ID}:`)) return userPlaces.find((p) => p.id === `user:${siteId.split(":")[1]}`) ?? null;
  return allPlaces(lab, userPlaces, candidatePlaces).find((p) => p.id === siteId) ?? null;
}

/** The globe site that stands for a Lab place, or null (engine reference sites are not on the globe). */
export function siteIdForPlace(place: Place, target: Target): string | null {
  if (place.group === "catalogue" || place.group === "proposal") return place.targets.includes(target) ? place.id : null;
  if (place.group === "candidate") return `hypatia-engine:${place.id.slice("cell:".length)}:${target}`;
  return null;
}

/**
 * Selects a globe site in the Lab, with the given mission region or else the one it resembles
 * most. Returns false when the Lab's data are not loaded or have nothing for the site.
 */
export function openInLab(siteId: string, target: Target, regionId?: string): boolean {
  const lab = useLab.getState().dataset;
  if (!lab) return false;
  const place = labPlaceForSite(lab, siteId);
  if (!place) return false;
  if (place.group === "candidate") useLab.getState().addCandidatePlace(place);
  const objectiveId = useLab.getState().objectiveId;
  const best = regionId ?? rankRegions(lab, place, target, objectiveId in lab.objectives ? objectiveId : "balanced").find((r) => r.result.score !== null)?.region.id;
  useLab.getState().select({ target, placeId: place.id, ...(best ? { regionId: best } : {}) });
  return true;
}

/** Opens the discovery panel on the globe, aimed at a mission region chosen in the Lab. */
export function discoverForRegion(regionId: string): void {
  useUi.getState().setDiscoverRegion(regionId);
  useUi.getState().setDiscoverOpen(true);
}

/** Asks the globe to select a site once it is on screen. */
export function selectOnGlobe(siteId: string): void {
  useGlobeView.getState().requestSelect(siteId);
}
