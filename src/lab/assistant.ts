import type { EngineDataset } from "@/discovery/engine/types";
import { pick, type Lang, type Translate } from "@/i18n";
import type { Target } from "@/types/site";
import { coord, pct } from "./format";
import { parseCoordinates } from "./livePlace";
import { bodyName } from "./report";
import { explain, rankPlaces, rankRegions, scorePair } from "./scoring";
import type { LabDataset, Place, Region } from "./types";

/**
 * The Lab's assistant. It answers from the engine's data only: it finds which place, region
 * and objective a question is about, runs the same scoring as the Compare tab, and writes the
 * answer from the numbers. It does not guess: when it cannot tell what is being asked, it
 * says what it can do.
 */

export interface AssistantContext {
  ds: LabDataset;
  places: Place[];
  target: Target;
  objectiveId: string;
  lang: Lang;
  t: Translate;
  /** The discovery engine's dataset (new places), when it is loaded. */
  discovery: EngineDataset | null;
}

export interface AssistantReply {
  /** Markdown. */
  text: string;
  /** What the answer is about, so the other tabs can show it. */
  select?: { placeId?: string; regionId?: string; target?: Target; objectiveId?: string };
  /** The question asks to add this place; the caller retrieves it and reports back. */
  addQuery?: string;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Words too common in place names to identify one. */
const COMMON = new Set(["crater", "crateres", "cratere", "desert", "desierto", "deserto", "region", "regione", "valley", "valle", "valles", "lake", "lago", "mare", "planum", "planitia", "island", "isla", "isola", "field", "national", "monument", "station", "structure", "impact", "south", "north", "polar", "pole", "site", "landing", "rover", "volcanic", "complex", "basin", "highlands", "depression", "formations"]);

export function bestMatch<T>(question: string, items: T[], names: (item: T) => string[]): T | null {
  const q = ` ${norm(question)} `;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    let score = 0;
    for (const name of names(item)) {
      const n = norm(name);
      if (n.length > 3 && q.includes(` ${n} `)) score = Math.max(score, 10 + n.length);
      const tokens = n.split(" ").filter((w) => w.length >= 4 && !COMMON.has(w));
      const hits = tokens.filter((w) => q.includes(` ${w}`)).length;
      if (hits) score = Math.max(score, hits + hits / (tokens.length + 1));
    }
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

const texts = (x: { en: string; es?: string; it?: string } | null | undefined) => (x ? [x.en, x.es, x.it].filter((s): s is string => Boolean(s)) : []);

const OBJECTIVE_WORDS: Record<string, string[]> = {
  rover_mobility: ["rover", "mobility", "movilidad", "mobilita", "drive", "traverse"],
  water_ice_detection: ["ice", "hielo", "ghiaccio", "water", "agua", "acqua"],
  astrobiology: ["astrobio", "life", "vida", "vita", "biosignature", "biofirma"],
  planetary_geology: ["geolog"],
  regolith_soil: ["regolith", "regolito", "regolite", "soil", "suelo", "suolo", "isru"],
  instrument_testing: ["instrument", "sensor", "strument"],
  habitat_infrastructure: ["habitat", "infrastructure", "infraestructura", "infrastruttura"],
  extreme_survival: ["surviv", "superviv", "sopravviv"],
};

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function localAnswer(question: string, ctx: AssistantContext): AssistantReply {
  const { ds, places, lang, t } = ctx;
  const q = norm(question);
  const name = (x: { name: { en: string; es?: string } }) => pick(lang, x.name);

  // ---- add a place
  const addMatch = /^\s*(?:please\s+)?(?:add|include|añade|anade|añadir|agrega|agregar|incluye|aggiungi|aggiungere|includi)\b[\s:]*(?:the place|el lugar|il luogo|place|lugar|luogo)?[\s:]*(.+)$/i.exec(question);
  if (addMatch?.[1]?.trim()) return { text: "", addQuery: addMatch[1].trim().replace(/[.?!]+$/, "") };
  if (parseCoordinates(question)) return { text: "", addQuery: question.trim() };

  const target: Target = /\b(moon|luna|lunar)\b/.test(q) ? "moon" : /\b(mars|marte|martian|marciano)\b/.test(q) ? "mars" : ctx.target;
  const objectiveId = Object.entries(OBJECTIVE_WORDS).find(([, words]) => has(q, words))?.[0] ?? ctx.objectiveId;
  const objective = pick(lang, ds.objectives[objectiveId]!.label);
  const place = bestMatch(question, places, (p) => texts(p.name));
  const region = bestMatch(question, ds.regions, (r) => [...texts(r.name), r.id.replace(/_/g, " ")]);

  // ---- sources and method
  if (has(q, ["source", "fuente", "fonte", "fonti", "where does the data", "de donde", "da dove", "dataset"]) && !place && !region) {
    const used = ds.sources.links.filter((l) => l.used === "yes").map((l) => l.title);
    const latest = ds.sources.freshness.collections[0];
    return {
      text: [
        t("The engine stores {n} values, each with its source, period and kind (measured, reanalysis, modelled, derived, literature or coded).", { n: ds.sources.valuesStored.toLocaleString("en-US") }),
        "",
        `${t("Pages and services it reads:")} ${used.join(", ")}.`,
        latest?.latest ? t("Newest NASA month it found for {name}: {date}.", { name: latest.shortName, date: latest.latest.slice(0, 7) }) : "",
        "",
        t("The Sources tab lists every page, what is taken from it and what could not be retrieved."),
      ].join("\n"),
    };
  }

  // ---- machine learning
  if (has(q, ["machine learning", "aprendizaje", "apprendimento", "cluster", "environment type", "tipo de ambiente", "tipo di ambiente", "rarity", "rareza", "rarita"]) && !region) {
    const m = ds.model;
    if (!m) return { text: t("The environment model is not available in this data file.") };
    const lines = [t("The model groups {n} land grid cells into {k} environment types from NASA POWER variables, with no labels given by hand (k-means), places each on a two-axis map (PCA) and scores how rare each is (isolation forest).", { n: m.cells, k: m.clusters.length })];
    if (place && m.places[place.id]) {
      const d = m.places[place.id]!;
      lines.push("", t("{place} falls in the type “{type}” and is rarer than {r} of Earth's land.", { place: name(place), type: pick(lang, m.clusters[d.cluster]!.name), r: pct(d.rarity) }));
    }
    lines.push("", t("It is used to find where on Earth conditions resemble a region, and to tell common environments from rare ones. The Machine learning tab shows the map."));
    return { text: lines.join("\n"), select: place ? { placeId: place.id } : undefined };
  }

  // ---- new places for a region
  if (region && has(q, ["new", "nuev", "nuov", "candidate", "candidat", "discover", "descubr", "scopri", "not in", "uncatalog"])) {
    const d = ctx.discovery?.regions.find((r) => r.id === region.id);
    if (!ctx.discovery || !d) return { text: t("The discovery data are not loaded yet. Open the globe once and ask again.") };
    const lines = [t("New places (not in any analog catalogue) whose measured environment and terrain are closest to {region}:", { region: name(region) }), ""];
    for (const m of d.top.slice(0, 5)) {
      const c = ctx.discovery.cells[m.cell]!;
      lines.push(`- **${c.place ?? t("Unnamed area")}**, ${c.country} (${c.coord}) — ${t("similarity {s}", { s: pct(m.score) })}`);
    }
    lines.push("", t("They are search areas, not sites: geology has not been assessed. Run “Discover new analogs” on the globe to see them as pins."));
    return { text: lines.join("\n"), select: { regionId: region.id, target: region.target } };
  }

  // ---- compare a place with a region
  if (place && region) {
    const r = scorePair(ds, place, region, objectiveId);
    if (r.score === null) return { text: t("{place} and {region} have no value in common to compare for this objective.", { place: name(place), region: name(region) }), select: { placeId: place.id, regionId: region.id, target: region.target, objectiveId } };
    const { drivers, differences } = explain(r, 3);
    const cats = (Object.keys(r.categoryScores) as (keyof typeof r.categoryScores)[]).map((c) => `${pick(lang, ds.categories[c].label)} ${r.categoryScores[c]!.toFixed(2)}`);
    return {
      text: [
        t("**{place} ↔ {region}**: similarity **{score}** out of 1 for the objective “{objective}”, confidence {label} (coverage {coverage}).", { place: name(place), region: name(region), score: r.score.toFixed(2), objective, label: pick(lang, r.confidenceLabel).toLowerCase(), coverage: pct(r.coverage) }),
        "",
        `${t("By category:")} ${cats.join(" · ")}.`,
        drivers.length ? `${t("Closest in:")} ${drivers.map((d) => pick(lang, d.label)).join(", ")}.` : "",
        differences.length ? `${t("Furthest apart in:")} ${differences.map((d) => pick(lang, d.label)).join(", ")}.` : "",
        "",
        t("A score ranks places; it does not make this one equivalent to {body}. The Compare and Report tabs now show this pair in full.", { body: t(bodyName(region.target)) }),
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
      select: { placeId: place.id, regionId: region.id, target: region.target, objectiveId },
    };
  }

  // ---- best places for a region
  if (region) {
    const ranked = rankPlaces(ds, places, region, objectiveId).filter((x) => x.result.score !== null).slice(0, 5);
    const lines = [`**${name(region)}** (${region.program}). ${pick(lang, region.summary)}`, "", t("Closest known places on Earth for the objective “{objective}”:", { objective }), ""];
    ranked.forEach((x, i) => lines.push(`${i + 1}. **${name(x.place)}** — ${x.result.score!.toFixed(2)} (${t("confidence")} ${pick(lang, x.result.confidenceLabel).toLowerCase()})`));
    lines.push("", t("Ask for “new places for {region}” to see places no catalogue lists.", { region: name(region) }));
    return { text: lines.join("\n").replace(/^(\d+)\. /gm, "- $1. "), select: { regionId: region.id, target: region.target, objectiveId } };
  }

  // ---- best regions for a place
  if (place) {
    const ranked = rankRegions(ds, place, target, objectiveId).filter((x) => x.result.score !== null).slice(0, 3);
    const lines = [`**${name(place)}** (${coord(place.lat, place.lon)}).${place.summary ? ` ${pick(lang, place.summary)}` : ""}`, ""];
    if (ranked.length === 0) lines.push(t("The engine has no values for this place to compare with {body}.", { body: t(bodyName(target)) }));
    else {
      lines.push(t("Regions of {body} it resembles most for the objective “{objective}”:", { body: t(bodyName(target)), objective }), "");
      for (const x of ranked) lines.push(`- **${name(x.region)}** — ${x.result.score!.toFixed(2)} (${t("confidence")} ${pick(lang, x.result.confidenceLabel).toLowerCase()})`);
    }
    for (const n of place.notes) lines.push("", `*${t(n)}*`);
    return { text: lines.join("\n"), select: { placeId: place.id, target, regionId: ranked[0]?.region.id, objectiveId } };
  }

  return {
    text: [
      t("I answer from the engine's data. You can ask, for example:"),
      "",
      `- ${t("Which places are most like Jezero crater for rover mobility?")}`,
      `- ${t("Compare Haughton Crater with the Phoenix site")}`,
      `- ${t("New places for the Artemis south-pole region")}`,
      `- ${t("Add Salar de Atacama")}`,
      `- ${t("Where does the data come from?")}`,
      `- ${t("What is the machine learning for?")}`,
    ].join("\n"),
  };
}

/** What to say after a place was added from live NASA data. */
export function describeAddedPlace(place: Place, ctx: AssistantContext): AssistantReply {
  const { ds, t, lang } = ctx;
  const lines = [
    t("Added **{name}** ({coord}) with climate retrieved just now from NASA POWER for {period}.", { name: place.name.en, coord: coord(place.lat, place.lon), period: place.period ?? "" }),
    "",
  ];
  for (const target of ["mars", "moon"] as const) {
    const best = rankRegions(ds, place, target, ctx.objectiveId).filter((x) => x.result.score !== null)[0];
    if (best) lines.push(`- ${t("Closest region of {body}:", { body: t(bodyName(target)) })} **${pick(lang, best.region.name)}** — ${best.result.score!.toFixed(2)} (${t("confidence")} ${pick(lang, best.result.confidenceLabel).toLowerCase()})`);
  }
  lines.push("", t("Terrain and geology were not retrieved, so those categories are not scored. It is now in the list of places of every tab, under “Your places”."));
  const top = rankRegions(ds, place, ctx.target, ctx.objectiveId).filter((x) => x.result.score !== null)[0];
  return { text: lines.join("\n"), select: { placeId: place.id, regionId: top?.region.id } };
}

/** A region of the dataset by id (used by tests and by the tabs). */
export const regionById = (ds: LabDataset, id: string): Region | undefined => ds.regions.find((r) => r.id === id);
