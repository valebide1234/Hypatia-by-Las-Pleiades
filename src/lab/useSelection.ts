import { useMemo } from "react";
import { allPlaces, useLab } from "./store";
import { scorePair, type PairScore } from "./scoring";
import type { LabDataset, Place, Region } from "./types";

export interface Selection {
  places: Place[];
  place: Place;
  region: Region;
  objectiveId: string;
  result: PairScore;
}

/** The selected pair and its score, shared by the Lab's tabs. Falls back to the first entries. */
export function useSelection(ds: LabDataset): Selection {
  const { target, placeId, regionId, objectiveId, userPlaces, candidatePlaces } = useLab();
  return useMemo(() => {
    const places = allPlaces(ds, userPlaces, candidatePlaces);
    const place = places.find((p) => p.id === placeId) ?? places[0]!;
    const regions = ds.regions.filter((r) => r.target === target);
    const region = regions.find((r) => r.id === regionId) ?? regions[0]!;
    const objective = objectiveId in ds.objectives ? objectiveId : "balanced";
    return { places, place, region, objectiveId: objective, result: scorePair(ds, place, region, objective) };
  }, [ds, target, placeId, regionId, objectiveId, userPlaces, candidatePlaces]);
}
