import { hypatiaEngineProvider } from "@/discovery/engine/engineProvider";
import type { EngineDataset } from "@/discovery/engine/types";
import { QUALITY_BY_ID } from "@/data/qualities";
import { pick, type Lang } from "@/i18n";
import { bestMatch } from "@/lab/assistant";
import { discoverForRegion, openInLab, selectOnGlobe, siteIdForPlace } from "@/lab/bridge";
import { KIND_LABEL, unitLabel } from "@/lab/format";
import { fetchLivePlace, locate } from "@/lab/livePlace";
import { explain, rankPlaces, rankRegions, scorePair } from "@/lab/scoring";
import { allPlaces, useLab } from "@/lab/store";
import type { LabDataset, Place, Region } from "@/lab/types";
import { showOnGlobe } from "@/lab/userCandidate";
import { useDiscovery } from "@/store/discovery";
import type { Target } from "@/types/site";

/**
 * The assistant's tools. The model decides which to call; they run here, in the browser, on the
 * engine's data, and what they return is all the model knows. Each result says what it rests on
 * (`caveats`), so the model can pass the limits on to the user.
 */

export interface ToolEnv {
  lab: LabDataset;
  engine: EngineDataset | null;
  lang: Lang;
  /** Body the user is exploring. */
  target: Target;
  navigate: (path: string) => void;
}

const SCORE_CAVEAT = "A similarity score ranks places on the variables that could be compared. It does not make a place equivalent to the Moon or Mars: gravity, atmosphere and radiation always differ.";
const round = (x: number | null | undefined, d = 2) => (x == null ? null : Number(x.toFixed(d)));
const texts = (x: { en: string; es?: string; it?: string } | null | undefined) => (x ? [x.en, x.es, x.it].filter((s): s is string => Boolean(s)) : []);

function places(env: ToolEnv): Place[] {
  const { userPlaces, candidatePlaces } = useLab.getState();
  return allPlaces(env.lab, userPlaces, candidatePlaces);
}

function findPlace(env: ToolEnv, query: unknown): Place | null {
  if (typeof query !== "string" || !query.trim()) return null;
  const all = places(env);
  return all.find((p) => p.id === query) ?? bestMatch(query, all, (p) => [...texts(p.name), p.id.replace(/[-_:]/g, " ")]);
}

function findRegion(env: ToolEnv, query: unknown): Region | null {
  if (typeof query !== "string" || !query.trim()) return null;
  return env.lab.regions.find((r) => r.id === query) ?? bestMatch(query, env.lab.regions, (r) => [...texts(r.name), r.id.replace(/_/g, " "), r.program]);
}

const objectiveOf = (env: ToolEnv, value: unknown) => (typeof value === "string" && value in env.lab.objectives ? value : "balanced");
const GROUP: Record<Place["group"], string> = {
  catalogue: "in Hypatia's catalogue",
  proposal: "proposed by the team (not verified by any agency)",
  reference: "engine reference site (not in the catalogue, not on the globe)",
  candidate: "new candidate from the discovery engine (unverified)",
  user: "added by the user from live NASA POWER data",
};
const placeCard = (env: ToolEnv, p: Place) => ({ id: p.id, name: pick(env.lang, p.name), kind: GROUP[p.group], lat: round(p.lat), lon: round(p.lon) });
const regionCard = (env: ToolEnv, r: Region) => ({ id: r.id, name: pick(env.lang, r.name), body: r.target, program: r.program });
const notFound = (what: string, query: unknown) => ({ error: `No ${what} matches "${String(query)}". Call ${what === "place" ? "search_places" : "list_regions"} to see what exists.` });

type Input = Record<string, unknown>;

const TOOLS: Record<string, (input: Input, env: ToolEnv) => unknown | Promise<unknown>> = {
  list_regions: (input, env) => ({
    regions: env.lab.regions.filter((r) => !input.target || r.target === input.target).map((r) => ({ ...regionCard(env, r), summary: pick(env.lang, r.summary) })),
  }),

  search_places: (input, env) => {
    const all = places(env);
    const q = typeof input.query === "string" ? input.query.trim() : "";
    if (!q) return { count: all.length, places: all.map((p) => placeCard(env, p)) };
    const hit = findPlace(env, q);
    const lower = q.toLowerCase();
    const others = all.filter((p) => p !== hit && texts(p.name).some((n) => n.toLowerCase().includes(lower)));
    const found = [...(hit ? [hit] : []), ...others].slice(0, 8);
    return found.length ? { places: found.map((p) => placeCard(env, p)) } : { places: [], note: "No known place has that name. add_place can add it from live NASA data." };
  },

  rank_places: (input, env) => {
    const region = findRegion(env, input.region);
    if (!region) return notFound("region", input.region);
    const objective = objectiveOf(env, input.objective);
    const limit = typeof input.limit === "number" ? Math.min(15, Math.max(1, Math.round(input.limit))) : 5;
    const ranked = rankPlaces(env.lab, places(env), region, objective).filter((r) => r.result.score !== null);
    return {
      region: regionCard(env, region),
      objective: pick(env.lang, env.lab.objectives[objective]!.label),
      places_compared: ranked.length,
      ranking: ranked.slice(0, limit).map((r, i) => ({ rank: i + 1, ...placeCard(env, r.place), similarity: round(r.result.score), confidence: pick("en", r.result.confidenceLabel).toLowerCase() })),
      caveats: [SCORE_CAVEAT, "Known places only. discover_new_places finds places that no catalogue lists."],
    };
  },

  compare: (input, env) => {
    const place = findPlace(env, input.place);
    if (!place) return notFound("place", input.place);
    const region = findRegion(env, input.region);
    if (!region) return notFound("region", input.region);
    const objective = objectiveOf(env, input.objective);
    const r = scorePair(env.lab, place, region, objective);
    useLab.getState().select({ target: region.target, placeId: place.id, regionId: region.id, objectiveId: objective });
    if (r.score === null) return { place: placeCard(env, place), region: regionCard(env, region), similarity: null, note: "The two have no value in common to compare.", place_notes: place.notes };
    const { drivers, differences } = explain(r, 4);
    const row = (d: (typeof drivers)[number]) => ({
      parameter: pick(env.lang, d.label),
      earth: round(d.earth, 3),
      region: round(d.target, 3),
      unit: unitLabel(d.unit),
      similarity: round(d.similarity),
      earth_value_is: d.earthKind ? KIND_LABEL[d.earthKind].toLowerCase() : null,
      region_value_is: d.targetKind ? KIND_LABEL[d.targetKind].toLowerCase() : null,
    });
    return {
      place: placeCard(env, place),
      region: regionCard(env, region),
      objective: pick(env.lang, env.lab.objectives[objective]!.label),
      similarity: round(r.score),
      confidence: pick("en", r.confidenceLabel).toLowerCase(),
      data_coverage: round(r.coverage),
      by_category: Object.fromEntries(Object.entries(r.categoryScores).map(([c, v]) => [pick(env.lang, env.lab.categories[c as keyof typeof r.categoryScores].label), round(v)])),
      closest_in: drivers.map(row),
      furthest_apart_in: differences.map(row),
      parameters_compared: r.scored,
      parameters_missing: r.missing,
      place_notes: place.notes,
      caveats: [SCORE_CAVEAT],
      in_app: "This pair is now selected in the Lab (Compare, Report and Applications views).",
    };
  },

  place_profile: (input, env) => {
    const place = findPlace(env, input.place);
    if (!place) return notFound("place", input.place);
    const target: Target = input.target === "moon" || input.target === "mars" ? input.target : env.target;
    const values = Object.entries(place.features)
      .filter(([k]) => k in env.lab.parameters && env.lab.parameters[k]!.mode !== "ordinal")
      .map(([k, v]) => ({ parameter: pick(env.lang, env.lab.parameters[k]!.label), value: round(v, 3), unit: unitLabel(env.lab.parameters[k]!.unit), obtained: KIND_LABEL[place.kinds[k] ?? "measured"].toLowerCase() }));
    const geology = Object.entries(place.features)
      .filter(([k, v]) => env.lab.parameters[k]?.mode === "ordinal" && v >= 0.5)
      .map(([k, v]) => `${pick(env.lang, env.lab.parameters[k]!.label)} (${v >= 1 ? "dominant" : "present"})`);
    const model = env.lab.model?.places[place.id];
    const proposal = env.engine?.proposals?.find((p) => p.id === place.id);
    const finding = env.engine?.siteFindings[place.id];
    return {
      ...placeCard(env, place),
      summary: pick(env.lang, place.summary) || undefined,
      proposal: proposal
        ? { status: proposal.status, rationale: pick(env.lang, proposal.rationale), note: proposal.note ? pick(env.lang, proposal.note) : undefined, claimed_qualities: proposal.proposed.map((q) => `${QUALITY_BY_ID.get(q.qualityId)?.label ?? q.qualityId} (${q.strength}; from ${q.evidence === "literature" ? "the cited study" : "the team's proposal"}, not verified by the engine)`), references: proposal.references.map((r) => r.title) }
        : undefined,
      values,
      geology_coded_from_literature: geology.length ? geology : "not coded for this place",
      environment_type: model && env.lab.model ? { type: pick(env.lang, env.lab.model.clusters[model.cluster]!.name), rarer_than_share_of_land: round(model.rarity) } : "not placed by the model",
      closest_regions: rankRegions(env.lab, place, target, "balanced")
        .filter((r) => r.result.score !== null)
        .slice(0, 3)
        .map((r) => ({ ...regionCard(env, r.region), similarity: round(r.result.score), confidence: pick("en", r.result.confidenceLabel).toLowerCase() })),
      engine_findings: finding?.checks.filter((c) => c.target === target).map((c) => ({ quality: QUALITY_BY_ID.get(c.qualityId)?.label ?? c.qualityId, finding: c.status === "new_use" ? "supported by the data but not listed in the catalogue (a possible new use)" : c.status === "confirmed" ? "listed in the catalogue and supported by the data" : "listed in the catalogue but not supported by the grid-cell value", strength: c.strength })),
      notes: place.notes,
      caveats: ["Climate values describe a reanalysis grid cell about 50 km wide, not an outcrop.", SCORE_CAVEAT],
    };
  },

  discover_new_places: async (input, env) => {
    if (!env.engine) return { error: "The discovery data are not loaded yet. Ask again in a moment." };
    const target: Target = input.target === "moon" ? "moon" : "mars";
    const region = input.region ? findRegion(env, input.region) : null;
    if (input.region && (!region || region.target !== target)) return notFound("region", input.region);
    const qualityIds = Array.isArray(input.qualities) ? input.qualities.filter((q): q is string => typeof q === "string") : [];
    await useDiscovery.getState().run(hypatiaEngineProvider, { target, qualityIds, missionRegionId: region?.id, preferNewData: input.prefer_new_data === true });
    if (region) useLab.getState().select({ target, regionId: region.id });
    const found = useDiscovery.getState().candidates.filter((c) => c.discovery?.providerId === hypatiaEngineProvider.id && c.targets.includes(target));
    return {
      body: target,
      resembling: region ? regionCard(env, region) : undefined,
      new_places: found.map((c) => ({ id: c.id, name: c.name, country: c.country, lat: c.lat, lon: c.lon, supported_qualities: c.similarities.map((s) => `${QUALITY_BY_ID.get(s.qualityId)?.label ?? s.qualityId} (${s.strength})`), evidence: c.similarities.map((s) => s.explanation), summary: c.summary })),
      in_app: found.length ? "These are now on the globe as amber candidate pins." : undefined,
      note: found.length ? undefined : "No place outside the known analogs meets every requested quality. Fewer qualities or another region may give results.",
      caveats: ["Candidates are search areas about 40 km across on a 5° grid, not sites, and nobody has verified them in the field.", "Geology was not assessed: the engine retrieves climate and terrain only.", SCORE_CAVEAT],
    };
  },

  add_place: async (input, env) => {
    if (typeof input.query !== "string" || !input.query.trim()) return { error: "add_place needs a place name or 'lat, lon'." };
    const located = await locate(input.query, env.lang);
    const place = await fetchLivePlace(located);
    useLab.getState().addUserPlace(place);
    const best = (target: Target) =>
      rankRegions(env.lab, place, target, "balanced")
        .filter((r) => r.result.score !== null)
        .slice(0, 2)
        .map((r) => ({ ...regionCard(env, r.region), similarity: round(r.result.score), confidence: pick("en", r.result.confidenceLabel).toLowerCase() }));
    return {
      added: { id: place.id, name: place.name.en, lat: round(place.lat, 3), lon: round(place.lon, 3), located_with: located.via === "coordinates" ? "the coordinates given" : "OpenStreetMap" },
      climate_period: place.period,
      climate: { mean_surface_temperature_C: round((place.features.tsurf_mean_K ?? NaN) - 273.15, 1), precipitation_mm_per_year: round(place.features.precip_mm_yr, 0), surface_pressure_kPa: round((place.features.pressure_Pa ?? NaN) / 1000, 1), uv_index_daily_mean: round(place.features.ctx_uv_index, 1) },
      closest_regions: { mars: best("mars"), moon: best("moon") },
      in_app: "It is now in the list of places of the Lab, under 'Your places'. show_on_globe puts it on the globe.",
      caveats: ["Retrieved live from NASA POWER (MERRA-2 reanalysis and CERES) for this point.", "Terrain and geology were not retrieved, so those categories are not scored and the confidence is lower.", "No check of how much of the grid cell is land: on a coast or island the values can describe the sea.", SCORE_CAVEAT],
    };
  },

  show_on_globe: (input, env) => {
    const place = findPlace(env, input.place);
    if (!place) return notFound("place", input.place);
    const target: Target = input.target === "moon" || input.target === "mars" ? input.target : place.targets.includes(env.target) ? env.target : (place.targets[0] ?? env.target);
    if (place.group === "user") {
      env.navigate(showOnGlobe(place, target));
      return { shown: true, place: placeCard(env, place), body: target };
    }
    const siteId = siteIdForPlace(place, target);
    if (!siteId) return { shown: false, reason: place.group === "reference" ? "Engine reference sites are not on the globe yet; the place can be studied in the Lab (open_in_lab)." : `This place is not listed as an analog for ${target}.` };
    selectOnGlobe(siteId);
    env.navigate(`/explore/${target}`);
    return { shown: true, place: placeCard(env, place), body: target };
  },

  open_in_lab: (input, env) => {
    const place = input.place ? findPlace(env, input.place) : null;
    if (input.place && !place) return notFound("place", input.place);
    const region = input.region ? findRegion(env, input.region) : null;
    if (input.region && !region) return notFound("region", input.region);
    const objective = typeof input.objective === "string" && input.objective in env.lab.objectives ? input.objective : undefined;
    useLab.getState().select({ ...(region ? { target: region.target, regionId: region.id } : {}), ...(place ? { placeId: place.id } : {}), ...(objective ? { objectiveId: objective } : {}) });
    env.navigate("/lab");
    return { opened: true, place: place ? placeCard(env, place) : "unchanged", region: region ? regionCard(env, region) : "unchanged" };
  },

  data_sources: (_input, env) => {
    const s = env.lab.sources;
    return {
      values_stored: s.valuesStored,
      climate_statistics_period: `${env.lab.climatePeriod.start}–${env.lab.climatePeriod.end}`,
      newest_month_in_the_data: env.engine?.windows.through,
      engine_run: env.lab.generatedAt.slice(0, 10),
      pages_and_services_used: s.links.filter((l) => l.used !== "no").map((l) => ({ name: l.title, url: l.url, used: l.used, what_is_taken: pick(env.lang, l.how) })),
      not_used: s.links.filter((l) => l.used === "no").map((l) => l.title),
      also_used: [...Object.values(s.otherSources).map((x) => pick(env.lang, x)), "Copernicus DEM GLO-90", "Natural Earth", "OpenStreetMap Nominatim (place names)"],
      newest_nasa_data: s.freshness.collections.map((c) => ({ collection: c.shortName, newest: (c.latest ?? "").slice(0, 10) })),
      could_not_be_retrieved: s.missing.map((m) => `${pick(env.lang, m.entity)}: ${pick(env.lang, m.parameter)} (${pick(env.lang, m.reason)})`),
      caveats: ["Every value keeps its source, period and kind (measured, reanalysis, modelled, derived, literature or coded from literature). A value that cannot be retrieved is reported, never filled in."],
    };
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

/** Runs one tool call. Never throws: a failure is returned to the model as an error it can explain. */
export async function runTool(name: string, input: unknown, env: ToolEnv): Promise<{ result: unknown; isError: boolean }> {
  const tool = TOOLS[name];
  if (!tool) return { result: { error: `Unknown tool "${name}".` }, isError: true };
  try {
    const result = await tool((input ?? {}) as Input, env);
    return { result, isError: Boolean(result && typeof result === "object" && "error" in result) };
  } catch (e) {
    return { result: { error: e instanceof Error ? e.message : "The tool failed." }, isError: true };
  }
}

// Used by the "find new places" path from the Lab; kept here so the tools file owns the list of app actions.
export { discoverForRegion, openInLab };
