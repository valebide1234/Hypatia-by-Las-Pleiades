import { useMemo } from "react";
import { useDiscovery } from "@/store/discovery";
import type { AnalogSite } from "@/types/site";
import { SITES } from "./sites";

/**
 * Every site the app currently knows: the curated catalogue plus Hypatia candidates from
 * discovery runs. Use this (not SITES) wherever candidates must behave like any other site.
 */
export function useAllSites(): AnalogSite[] {
  const candidates = useDiscovery((s) => s.candidates);
  return useMemo(() => (candidates.length ? [...SITES, ...candidates] : SITES), [candidates]);
}

export function findSite(id: string): AnalogSite | undefined {
  return SITES.find((s) => s.id === id) ?? useDiscovery.getState().candidates.find((c) => c.id === id);
}
