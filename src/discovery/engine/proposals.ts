import { pick, type Lang, type Translate } from "@/i18n";
import { STRENGTH_WEIGHT } from "@/lib/ranking";
import type { AnalogSite, Limitation, Similarity, Target } from "@/types/site";
import { TERRAIN_QUALITY, terrainSentence, terrainStrength, trendSentence } from "./buildCandidates";
import type { EngineDataset, EngineProposal } from "./types";

export const TEAM_PROVIDER_ID = "team-proposals";
/** Confidence shown for a proposal: higher when a published study supports the analogy. */
const CONFIDENCE = { under_review: 0.6, unverified: 0.3 } as const;

export const isTeamProposal = (siteId: string) => siteId.startsWith("team:");

/**
 * A team proposal as a site for the globe: an amber candidate, never an official analog. Its
 * qualities come from three places, each labelled in its explanation: the cited study, the
 * team's own proposal, and what the engine measured at the coordinates.
 */
export function proposalSite(ds: EngineDataset, p: EngineProposal, lang: Lang, t: Translate): AnalogSite {
  const similarities: Similarity[] = [];
  const add = (s: Similarity) => {
    const i = similarities.findIndex((x) => x.qualityId === s.qualityId && x.target === s.target);
    if (i < 0) similarities.push(s);
    else {
      const prev = similarities[i]!;
      similarities[i] = {
        ...prev,
        strength: STRENGTH_WEIGHT[s.strength] > STRENGTH_WEIGHT[prev.strength] ? s.strength : prev.strength,
        explanation: `${prev.explanation} ${s.explanation}`,
      };
    }
  };
  const limitations: Limitation[] = [];

  for (const target of p.targets) {
    for (const q of p.proposed.filter((x) => x.targets.includes(target))) {
      const origin = q.evidence === "literature" ? t("From the cited study; not verified by the engine.") : t("From the team's proposal; not verified by the engine.");
      add({ qualityId: q.qualityId, target, strength: q.strength, explanation: `${pick(lang, q.text)} ${origin}` });
    }
    if (target === "mars") {
      for (const q of p.qualities) add({ qualityId: q.id, target, strength: q.strength, explanation: `${t("Measured by the engine:")} ${q.text}${trendSentence(ds, q)}` });
      for (const f of p.fails) limitations.push({ qualityId: f.id, target, explanation: f.text });
    }
    const terrain = p.terrain[target];
    const region = terrain ? ds.regions.find((r) => r.id === terrain.region) : undefined;
    const strength = terrain ? terrainStrength(ds, terrain.topo) : null;
    if (terrain && region && strength) add({ qualityId: TERRAIN_QUALITY, target, strength, explanation: terrainSentence(ds, target, region, terrain.topo, p.values) });

    limitations.push({ target, explanation: t("Proposed by the team, not recognised by any space agency. The engine measured climate and terrain here; it has not verified the geology or the biology the proposal describes.") });
    if (p.surface === "humid") limitations.push({ target, explanation: t("Humid climate ({n} mm/yr in the reanalysis grid cell): vegetation cover is likely, unlike the bare surfaces of the target.", { n: p.values.precip_mm_yr ?? "?" }) });
    limitations.push({
      target,
      explanation:
        target === "mars"
          ? t("Earth's dense atmosphere and magnetic field shield the surface from radiation, gravity is about 2.6 times that of Mars, and liquid water and life are present.")
          : t("The Moon has no atmosphere, wind, weather or liquid water, its gravity is about one sixth of Earth's, and lunar regolith has no natural equivalent on Earth."),
    });
  }

  return {
    id: p.id,
    name: p.name,
    country: p.country,
    lat: p.lat,
    lon: p.lon,
    origin: "hypatia_candidate",
    programs: [t("Proposed by Las Pléyades")],
    targets: p.targets,
    summary: [pick(lang, p.rationale), p.note ? pick(lang, p.note) : ""].filter(Boolean).join(" "),
    similarities,
    limitations,
    researchUse: [],
    images: { earth: [], target: [] },
    references: p.references,
    discovery: {
      providerId: TEAM_PROVIDER_ID,
      runAt: ds.generatedAt,
      confidence: CONFIDENCE[p.status],
      datasetsUsed: ds.datasets.earth,
      method: t("proposed by the team from its own research and measured by the engine at its coordinates; confidence is 60% when a published study supports the analogy and 30% otherwise"),
      status: p.status,
    },
  };
}

export function proposalSites(ds: EngineDataset | null, lang: Lang, t: Translate): AnalogSite[] {
  return (ds?.proposals ?? []).map((p) => proposalSite(ds!, p, lang, t));
}

export function proposalsFor(ds: EngineDataset | null, target: Target): EngineProposal[] {
  return (ds?.proposals ?? []).filter((p) => p.targets.includes(target));
}
