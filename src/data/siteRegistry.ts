import { useMemo } from "react";
import { candidateFromId, cellIdOf } from "@/discovery/engine/buildCandidates";
import { proposalSites } from "@/discovery/engine/proposals";
import { translate, useLang, useT } from "@/i18n";
import { useDiscovery } from "@/store/discovery";
import { useEngine } from "@/store/engine";
import { useUserData } from "@/store/userData";
import type { AnalogSite } from "@/types/site";
import { SITES } from "./sites";

/**
 * Every site the app currently knows: the curated catalogue, the places proposed by the team
 * (measured by the engine), the Hypatia candidates from discovery runs, and the engine
 * candidates saved as favourites (rebuilt from the engine's data, so they are still there
 * after a reload). Use this (not SITES) wherever candidates must behave like any other site.
 */
export function useAllSites(): AnalogSite[] {
  const candidates = useDiscovery((s) => s.candidates);
  const favourites = useUserData((s) => s.fav.favourites);
  const dataset = useEngine((s) => s.dataset);
  const lang = useLang((s) => s.lang);
  const t = useT();
  return useMemo(() => {
    const proposals = proposalSites(dataset, lang, t);
    const shown = new Set([...candidates, ...proposals].map((c) => c.id));
    const saved: AnalogSite[] = [];
    if (dataset) {
      for (const f of favourites) {
        if (shown.has(f.siteId) || !cellIdOf(f.siteId)) continue;
        const site = candidateFromId(dataset, f.siteId);
        if (site) {
          saved.push(site);
          shown.add(site.id);
        }
      }
    }
    return candidates.length || saved.length || proposals.length ? [...SITES, ...proposals, ...candidates, ...saved] : SITES;
  }, [candidates, favourites, dataset, lang, t]);
}

export function findSite(id: string): AnalogSite | undefined {
  const known = SITES.find((s) => s.id === id) ?? useDiscovery.getState().candidates.find((c) => c.id === id);
  if (known) return known;
  const dataset = useEngine.getState().dataset;
  if (!dataset) return undefined;
  const lang = useLang.getState().lang;
  const proposal = proposalSites(dataset, lang, (text, vars) => translate(lang, text, vars)).find((p) => p.id === id);
  return proposal ?? candidateFromId(dataset, id) ?? undefined;
}
