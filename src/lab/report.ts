import { pick, tx, type Lang, type Translate } from "@/i18n";
import { KIND_LABEL, coord, pct, showValue, unitLabel } from "./format";
import { explain, feasibleOnEarth, notReproducible, rankPlaces, scorePair, suggestExperiments, type DetailRow, type RowStatus } from "./scoring";
import type { CategoryId, LabDataset, Place, Region } from "./types";

const STATUS: Record<Exclude<RowStatus, "scored">, string> = {
  not_applicable: tx("not applicable"),
  excluded_by_objective: tx("not used for this objective"),
  missing_earth: tx("no Earth value"),
  missing_target: tx("no value for the region"),
  joint_absence: tx("absent in both"),
};

export const bodyName = (target: "moon" | "mars") => (target === "moon" ? tx("the Moon") : tx("Mars"));

/** NASA Worldview and Earthdata Search centred on a place, for current satellite imagery. */
export function worldviewLink(lat: number, lon: number): string {
  const h = 1.5;
  return `https://worldview.earthdata.nasa.gov/?v=${(lon - 2 * h).toFixed(3)},${(lat - h).toFixed(3)},${(lon + 2 * h).toFixed(3)},${(lat + h).toFixed(3)}&l=Reference_Labels_15m%28hidden%29,Coastlines_15m,MODIS_Terra_CorrectedReflectance_TrueColor`;
}
export function earthdataSearchLink(lat: number, lon: number): string {
  return `https://search.earthdata.nasa.gov/search?lat=${lat.toFixed(4)}&long=${lon.toFixed(4)}&zoom=7`;
}

/**
 * The scientific report of one pair, in ten sections, as Markdown (the same structure as the
 * engine's own reports, engine/analogs/report.py). Everything in it is computed from the Lab
 * data; nothing is written by hand for a particular pair.
 */
export function buildReport(ds: LabDataset, places: Place[], place: Place, region: Region, objectiveId: string, t: Translate, lang: Lang): string {
  const res = scorePair(ds, place, region, objectiveId);
  const objective = pick(lang, ds.objectives[objectiveId]!.label);
  const body = t(bodyName(region.target));
  const siteName = pick(lang, place.name);
  const regionName = pick(lang, region.name);
  const cats = (Object.keys(ds.categories) as CategoryId[]).sort((a, b) => ds.categories[a].order - ds.categories[b].order);
  const label = (r: DetailRow) => pick(lang, r.label);
  const val = (v: number | null, unit: string) => showValue(t, v, unit);
  const L: string[] = [];

  L.push(`# ${t("Analog report: {site} ↔ {region}", { site: siteName, region: regionName })}`);
  L.push(`*${t("Objective: {objective} · Engine data of {date} · Climate {start}–{end}", { objective, date: ds.generatedAt.slice(0, 10), start: ds.climatePeriod.start, end: ds.climatePeriod.end })}*`, "");

  L.push(`## 1. ${t("Location on Earth")}`);
  L.push(`- **${t("Site")}:** ${siteName}${place.country ? ` (${pick(lang, place.country)})` : ""}`);
  L.push(`- **${t("Coordinates")}:** ${coord(place.lat, place.lon)} (WGS84)`);
  if (place.summary) L.push(`- **${t("Description")}:** ${pick(lang, place.summary)}`);
  L.push(
    `- **${t("Listed as")}:** ${t(place.group === "catalogue" ? tx("a site of Hypatia's catalogue") : place.group === "reference" ? tx("an engine reference site, not yet in Hypatia's catalogue") : tx("a place added in the Lab; its values were retrieved live from NASA POWER"))}`,
  );
  for (const n of place.notes) L.push(`- **${t("Note")}:** ${t(n)}`);
  L.push(`- **${t("Current satellite imagery")}:** [NASA Worldview](${worldviewLink(place.lat, place.lon)}) · [Earthdata Search](${earthdataSearchLink(place.lat, place.lon)})`, "");

  L.push(`## 2. ${t("Corresponding region on {body}", { body })}`);
  L.push(`- **${t("Region")}:** ${regionName} (${region.program})`);
  L.push(`- **${t("Coordinates")}:** ${region.lat.toFixed(3)}°, ${region.lon.toFixed(3)}° E (${t("planetocentric")}${region.coordSource ? `; ${pick(lang, region.coordSource)}` : ""})`);
  L.push(`- **${t("Description")}:** ${pick(lang, region.summary)}`);
  if (region.notes) L.push(`- **${t("Note")}:** ${pick(lang, region.notes)}`);
  L.push("");

  L.push(`## 3. ${t("Overall similarity score")}`);
  if (res.score === null) {
    L.push(t("No score: the two sides have no value in common for this objective."), "");
  } else {
    const ranked = rankPlaces(ds, places, region, objectiveId).filter((r) => r.result.score !== null);
    const rank = ranked.findIndex((r) => r.place.id === place.id) + 1;
    L.push(
      `**${res.score.toFixed(2)}** ${t("out of 1 (weighted tolerance method, objective “{objective}”)", { objective })}` +
        (rank ? ` — ${t("rank {rank} of {n} places for this region.", { rank, n: ranked.length })}` : "."),
      "",
    );
    L.push(t("Confidence: **{label}** (data coverage {coverage}, mean data quality {quality}).", { label: pick(lang, res.confidenceLabel), coverage: pct(res.coverage), quality: (res.dataQuality ?? 0).toFixed(2) }), "");
    L.push(`> ${t("A high score means the compared variables are close, within the stated tolerances. It does not show that the two environments are equivalent: gravity, radiation and atmospheric pressure are beyond what any place on Earth can reproduce (section 8).")}`, "");
    L.push(`| ${t("Category")} | ${t("Similarity")} | ${t("Weight")} | ${t("Coverage")} |`, "|---|---|---|---|");
    for (const c of cats) {
      const s = res.categoryScores[c];
      L.push(`| ${pick(lang, ds.categories[c].label)} | ${s === undefined ? "—" : s.toFixed(2)} | ${pct(res.categoryWeights[c])} | ${pct(res.categoryCoverage[c])} |`);
    }
    L.push("");
  }

  L.push(`## 4. ${t("Similarity by parameter")}`);
  L.push(t("Absolute values in common units. The similarity already includes each parameter's transform (linear or logarithmic) and tolerance."), "");
  for (const c of cats) {
    const rows = res.detail.filter((r) => r.category === c && r.status !== "joint_absence" && r.status !== "not_applicable");
    if (rows.length === 0) continue;
    L.push(`**${pick(lang, ds.categories[c].label)}**`, "");
    L.push(`| ${t("Parameter")} | ${t("Earth")} | ${body} | ${t("Unit")} | ${t("Similarity")} | ${t("Effective weight")} | ${t("Kind of data (Earth / {body})", { body })} |`, "|---|---|---|---|---|---|---|");
    for (const r of rows) {
      const sim = r.status === "scored" ? r.similarity!.toFixed(2) : `*${t(STATUS[r.status])}*`;
      const kinds = `${r.earthKind ? t(KIND_LABEL[r.earthKind]) : "—"} / ${r.targetKind ? t(KIND_LABEL[r.targetKind]) : "—"}`;
      L.push(`| ${label(r)} | ${val(r.earth, r.unit)} | ${val(r.target, r.unit)} | ${unitLabel(r.unit)} | ${sim} | ${r.status === "scored" ? `${(r.effectiveWeight * 100).toFixed(1)}%` : "—"} | ${kinds} |`);
    }
    L.push("");
  }
  const absent = res.detail.filter((r) => r.status === "joint_absence").map(label);
  if (absent.length) L.push(`*${t("Absent in both (not scored):")}* ${absent.join(", ")}.`, "");

  L.push(`## 5. ${t("Main geological similarities")}`);
  const geo = res.detail.filter((r) => r.mode === "ordinal" && r.status === "scored");
  const shared = geo.filter((r) => r.earth! >= 0.5 && r.target! >= 0.5);
  if (!res.detail.some((r) => r.mode === "ordinal" && r.earth !== null)) L.push(t("Geological descriptors have not been coded for this place, so geology is not compared."));
  else if (shared.length === 0) L.push(t("The coded descriptors show no geological or mineralogical feature shared by the two."));
  for (const r of shared) L.push(`- **${label(r)}**: ${t("{a} at the Earth site, {b} in the region.", { a: val(r.earth, r.unit), b: val(r.target, r.unit) })}`);
  const onlyTarget = geo.filter((r) => r.earth! < 0.5 && r.target! >= 0.5).map(label);
  const onlyEarth = geo.filter((r) => r.earth! >= 0.5 && r.target! < 0.5).map(label);
  if (onlyTarget.length) L.push("", `${t("Present in the region but not at the Earth site:")} ${onlyTarget.join(", ")}.`);
  if (onlyEarth.length) L.push("", `${t("Present at the Earth site but not in the region:")} ${onlyEarth.join(", ")}.`);
  L.push("", `*${t("Geological descriptors are an ordinal coding of the cited literature, not measurements.")}*`, "");

  L.push(`## 6. ${t("Main environmental differences")}`);
  const env = res.detail
    .filter((r) => r.status === "scored" && r.mode !== "ordinal" && r.similarity! < 0.6 && (r.category === "environment" || r.category === "water"))
    .sort((a, b) => a.similarity! - b.similarity!);
  if (env.length === 0) L.push(t("No compared environmental variable differs beyond its tolerance."));
  for (const r of env) {
    const u = unitLabel(r.unit) ? ` ${unitLabel(r.unit)}` : "";
    L.push(`- **${label(r)}**: ${t("{a} on Earth against {b} in the region (similarity {s}).", { a: `${val(r.earth, r.unit)}${u}`, b: `${val(r.target, r.unit)}${u}`, s: r.similarity!.toFixed(2) })}`);
  }
  const e = ds.applications.bodies.earth;
  const b = ds.applications.bodies[region.target];
  L.push("", t("Fixed planetary differences (outside the score):"));
  L.push(`- ${t("Gravity: {a} m/s² against {b} m/s².", { a: e.gravity, b: b.gravity })}`);
  L.push(`- ${t("Atmosphere: {a} against {b}.", { a: pick(lang, e.atmosphere), b: pick(lang, b.atmosphere) })}`);
  L.push(`- ${t("Solar constant: {a} W/m² against {b} W/m².", { a: Math.round(e.solarConstant), b: Math.round(b.solarConstant) })}`);
  L.push(`- ${t("Length of the solar day: {a} h against {b} h.", { a: e.solarDayHours, b: b.solarDayHours })}`);
  L.push(`- ${t("Radiation: {a} against {b}.", { a: pick(lang, e.radiation), b: pick(lang, b.radiation) })}`, "");

  L.push(`## 7. ${t("Possible experiments")}`);
  const suggested = suggestExperiments(ds, res);
  if (suggested.length) {
    L.push(t("Supported by features the site and the region share:"));
    for (const s of suggested) L.push(`- ${pick(lang, s)}`);
  } else L.push(t("The compared data do not support specific experiments for this pair."));
  const feasible = feasibleOnEarth(ds, objectiveId);
  if (feasible.length) {
    L.push("", t("Field tests that are feasible for the objective “{objective}”:", { objective }));
    for (const s of feasible) L.push(`- ${pick(lang, s)}`);
  }
  L.push("");

  L.push(`## 8. ${t("Limits of the analogy")}`);
  L.push(t("What happens on {body} and cannot be reproduced anywhere on Earth:", { body }));
  for (const item of notReproducible(ds, region.target, "balanced")) L.push(`- **${pick(lang, item.item)}.** ${pick(lang, item.why)}`);
  L.push("", t("Limits of the data and of the method:"));
  L.push(`- ${t("Terrain is compared in a {w} × {w} km window at a {b} m baseline; it does not describe roughness at rover scale (metres).", { w: ds.windowKm, b: ds.baselineM })}`);
  L.push(`- ${t("Earth's climate comes from a reanalysis with a resolution of about 50 km: it describes the grid cell, not the microclimate of an outcrop.")}`);
  L.push(
    `- ${t(region.target === "mars" ? tx("Martian atmospheric and thermal variables are output of the Mars Climate Database (a model), not in-situ measurements; the model's wind does not resolve local circulations in craters or canyons.") : tx("Lunar temperature is Diviner bolometric brightness temperature averaged in 0.5° cells (about 15 km at the equator), which mixes sunlit and shadowed ground; lunar albedo is a literature value by terrain type."))}`,
  );
  L.push(`- ${t("Geological descriptors are ordinal and do not capture abundances, ages or textures.")}`);
  L.push(`- ${t("Crater density and grain size are not compared: no homogeneous global product exists for the three bodies.")}`, "");

  L.push(`## 9. ${t("Data sources and references")}`);
  const used = res.detail.filter((r) => r.status === "scored" || r.status === "joint_absence").map((r) => r.parameter);
  const keys = [...new Set(used.flatMap((p) => [place.src[p], region.src[p]]).filter((k): k is string => Boolean(k)))];
  for (const k of keys) {
    const ref = ds.sources.references[k];
    if (ref) L.push(`- ${ref.url ? `[${ref.cite}](${ref.url})` : ref.cite} — *${pick(lang, ref.page)}*`);
    else if (k === "expert_coding") L.push(`- ${t("Geological descriptors coded by the engine's authors from the literature cited for each site and region.")}`);
    else if (ds.sources.otherSources[k]) L.push(`- ${pick(lang, ds.sources.otherSources[k])}`);
  }
  for (const k of [...new Set([...(place.geologyRefs ?? []), ...region.refs])]) {
    const ref = ds.sources.references[k];
    if (ref && !keys.includes(k)) L.push(`- ${ref.url ? `[${ref.cite}](${ref.url})` : ref.cite}`);
  }
  L.push("");

  L.push(`## 10. ${t("Confidence and data quality")}`);
  L.push(t("{scored} parameters were compared; {missing} could not be, because a value is missing on one side.", { scored: res.scored, missing: res.missing }));
  const kindsUsed = new Map<string, number>();
  for (const r of res.detail.filter((x) => x.status === "scored")) for (const k of [r.earthKind, r.targetKind]) if (k) kindsUsed.set(k, (kindsUsed.get(k) ?? 0) + 1);
  L.push("", t("Kinds of data behind the compared values:"));
  for (const [k, n] of [...kindsUsed.entries()].sort((a, c) => c[1] - a[1])) L.push(`- ${t(KIND_LABEL[k as keyof typeof KIND_LABEL])}: ${n} (${t("quality weight")} ${ds.dataQuality[k] ?? "—"})`);
  const { drivers, differences } = explain(res, 3);
  if (drivers.length) L.push("", `${t("The score rests mostly on:")} ${drivers.map(label).join(", ")}.`);
  if (differences.length) L.push(`${t("It is held back mostly by:")} ${differences.map(label).join(", ")}.`);
  L.push("", t("Confidence is data coverage multiplied by data quality. It says how well supported the score is, not how good the analog is."));
  return L.join("\n");
}
