import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { pick, tx, useLang, useT } from "@/i18n";
import { coord, pct, showValue, unitLabel } from "@/lab/format";
import { bodyName } from "@/lab/report";
import { explain, rankPlaces, type DetailRow, type RowStatus } from "@/lab/scoring";
import { useLab } from "@/lab/store";
import type { CategoryId, LabDataset } from "@/lab/types";
import { discoverForRegion, selectOnGlobe, siteIdForPlace } from "@/lab/bridge";
import { showOnGlobe } from "@/lab/userCandidate";
import SatelliteView from "./SatelliteView";
import { useSelection } from "@/lab/useSelection";
import { CHART, Card, KindChip, Meter, Note } from "./ui";

const STATUS: Record<Exclude<RowStatus, "scored">, string> = {
  not_applicable: tx("not applicable"),
  excluded_by_objective: tx("not used for this objective"),
  missing_earth: tx("no Earth value"),
  missing_target: tx("no value for the region"),
  joint_absence: tx("absent in both"),
};
const METHODS = [
  { id: "euclidean", label: tx("Euclidean distance"), help: tx("Weighted difference of standardised values over the variables both have.") },
  { id: "mahalanobis", label: tx("Mahalanobis distance"), help: tx("Also accounts for variables that move together.") },
  { id: "cosine", label: tx("Cosine similarity"), help: tx("Compares the pattern of deviations from Earth's average, ignoring their size.") },
] as const;

export default function CompareTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const navigate = useNavigate();
  const { places, place, region, objectiveId, result } = useSelection(ds);
  const { select, removeUserPlace } = useLab();
  const ranking = useMemo(() => rankPlaces(ds, places, region, objectiveId).filter((r) => r.result.score !== null), [ds, places, region, objectiveId]);
  const rank = ranking.findIndex((r) => r.place.id === place.id) + 1;
  const { drivers, differences } = explain(result);
  const cats = (Object.keys(ds.categories) as CategoryId[]).sort((a, b) => ds.categories[a].order - ds.categories[b].order);
  const body = t(bodyName(region.target));
  const label = (r: DetailRow) => pick(lang, r.label);
  const alt = ds.alternative[region.id];
  const nameOf = (id: string) => pick(lang, places.find((p) => p.id === id)?.name) || id;
  const globeSite = siteIdForPlace(place, region.target);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title={t("Overall similarity")} tour="lab-score">
          {result.score === null ? (
            <p className="text-sm text-slate-300">{t("No score: the two sides have no value in common for this objective.")}</p>
          ) : (
            <>
              <p className="flex items-baseline gap-3">
                <span className="font-display text-6xl leading-none text-white">{result.score.toFixed(2)}</span>
                <span className="text-sm text-slate-400">{t("out of 1")}</span>
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {pick(lang, place.name)} <span className="text-slate-500">↔</span> {pick(lang, region.name)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {coord(place.lat, place.lon)} · {region.program}
                {rank > 0 && ` · ${t("rank {rank} of {n} places for this region", { rank, n: ranking.length })}`}
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-slate-400">{t("Confidence")}</dt>
                  <dd className="mt-0.5 text-base text-white">{pick(lang, result.confidenceLabel)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">{t("Data coverage")}</dt>
                  <dd className="mt-0.5 text-base tabular-nums text-white">{pct(result.coverage)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">{t("Data quality")}</dt>
                  <dd className="mt-0.5 text-base tabular-nums text-white">{(result.dataQuality ?? 0).toFixed(2)}</dd>
                </div>
              </dl>
            </>
          )}
          <div className="mt-4">
            <Note>{t("A high score means the compared variables are close, within the stated tolerances. It does not show that the two environments are equivalent: gravity, radiation and atmospheric pressure are beyond what any place on Earth can reproduce.")}</Note>
          </div>
          {place.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-slate-400">
              {place.notes.map((n) => (
                <li key={n}>{t(n)}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2" data-tour="lab-links">
            {(place.group === "user" || globeSite) && (
              <button
                type="button"
                onClick={() => {
                  if (place.group === "user") navigate(showOnGlobe(place, region.target));
                  else if (globeSite) {
                    selectOnGlobe(globeSite);
                    navigate(`/explore/${region.target}`);
                  }
                }}
                className="rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-space-950 hover:bg-amber-200"
              >
                {t("Show on the globe")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                discoverForRegion(region.id);
                navigate(`/explore/${region.target}`);
              }}
              className="rounded-full border border-amber-300/50 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-300/10"
            >
              {t("Find new places like this region")}
            </button>
            {place.group === "user" && (
              <button type="button" onClick={() => removeUserPlace(place.id)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:border-white/50">
                {t("Remove this place")}
              </button>
            )}
          </div>
        </Card>

        <Card title={t("By category")}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-2 font-medium">{t("Category")}</th>
                <th scope="col" className="w-2/5 pb-2 font-medium">{t("Similarity")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Weight")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Coverage")}</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const s = result.categoryScores[c];
                return (
                  <tr key={c} className="border-t border-white/5">
                    <th scope="row" className="py-2 pr-2 text-left font-normal text-slate-200">{pick(lang, ds.categories[c].label)}</th>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <Meter value={s} />
                        <span className="w-9 shrink-0 text-right tabular-nums text-white">{s === undefined ? "—" : s.toFixed(2)}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{pct(result.categoryWeights[c])}</td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{pct(result.categoryCoverage[c])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("What brings them together")}</h4>
              <ul className="space-y-1 text-xs text-slate-300">
                {drivers.length === 0 && <li className="text-slate-500">—</li>}
                {drivers.map((r) => (
                  <li key={r.parameter} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{label(r)}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{r.similarity!.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("What sets them apart")}</h4>
              <ul className="space-y-1 text-xs text-slate-300">
                {differences.length === 0 && <li className="text-slate-500">—</li>}
                {differences.map((r) => (
                  <li key={r.parameter} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{label(r)}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{r.similarity!.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <SatelliteView lat={place.lat} lon={place.lon} name={pick(lang, place.name)} />

      <Card title={t("Every parameter, side by side")} tour="lab-parameters">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          {t("Values in common units. Similarity is 1 when the two values coincide and falls with their difference, measured against each parameter's tolerance. The label on the right says how each value was obtained; hover it for the meaning.")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-2 font-medium">{t("Parameter")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Earth")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{body}</th>
                <th scope="col" className="pb-2 pl-2 font-medium">{t("Unit")}</th>
                <th scope="col" className="w-40 pb-2 font-medium">{t("Similarity")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Weight")}</th>
                <th scope="col" className="pb-2 pl-3 font-medium">{t("Kind of data (Earth / {body})", { body })}</th>
              </tr>
            </thead>
            {cats.map((c) => {
              const rows = result.detail.filter((r) => r.category === c && r.status !== "not_applicable");
              if (rows.length === 0) return null;
              return (
                <tbody key={c}>
                  <tr>
                    <th scope="colgroup" colSpan={7} className="border-t border-white/15 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-widest text-pleiad-300">
                      {pick(lang, ds.categories[c].label)}
                    </th>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.parameter} className={`border-t border-white/5 ${r.status === "scored" ? "" : "text-slate-500"}`}>
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-200" title={pick(lang, ds.parameters[r.parameter]!.note) || undefined}>{label(r)}</th>
                      <td className="py-1.5 text-right tabular-nums">{showValue(t, r.earth, r.unit)}</td>
                      <td className="py-1.5 text-right tabular-nums">{showValue(t, r.target, r.unit)}</td>
                      <td className="py-1.5 pl-2 text-slate-500">{unitLabel(r.unit)}</td>
                      <td className="py-1.5">
                        {r.status === "scored" ? (
                          <span className="flex items-center gap-2">
                            <Meter value={r.similarity} />
                            <span className="w-8 shrink-0 text-right tabular-nums text-white">{r.similarity!.toFixed(2)}</span>
                          </span>
                        ) : (
                          <em>{t(STATUS[r.status])}</em>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{r.status === "scored" ? `${(r.effectiveWeight * 100).toFixed(1)}%` : "—"}</td>
                      <td className="py-1.5 pl-3">
                        <span className="flex gap-1">
                          <KindChip kind={r.earthKind} />
                          <KindChip kind={r.targetKind} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("Best known places for this region")}>
          <ol className="space-y-1">
            {ranking.slice(0, 8).map((r, i) => (
              <li key={r.place.id}>
                <button
                  type="button"
                  onClick={() => select({ placeId: r.place.id })}
                  aria-current={r.place.id === place.id}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5 ${r.place.id === place.id ? "bg-white/10" : ""}`}
                >
                  <span className="w-4 shrink-0 text-right tabular-nums text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-100">{pick(lang, r.place.name)}</span>
                  <span className="w-24 shrink-0">
                    <Meter value={r.result.score} color={r.place.id === place.id ? CHART.place : CHART.neutral} />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-white">{r.result.score!.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-slate-500">{t("Known sites only. For places that no catalogue lists, use “Discover new analogs” on the globe.")}</p>
        </Card>

        <Card title={t("Other ways of measuring similarity")}>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            {t("Three standard distances, to check whether the ranking depends on the method. They leave out the variables where {body} lies beyond anything on Earth.", { body })}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {METHODS.map((m) => (
              <div key={m.id}>
                <h4 className="text-xs font-medium text-slate-100" title={t(m.help)}>{t(m.label)}</h4>
                <ol className="mt-1 space-y-0.5 text-[11px] text-slate-300">
                  {(alt?.[m.id].top ?? []).map((x, i) => (
                    <li key={x.place} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{i + 1}. {nameOf(x.place)}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{x.score.toFixed(2)}</span>
                    </li>
                  ))}
                  {(alt?.[m.id].top ?? []).length === 0 && <li className="text-slate-500">—</li>}
                </ol>
              </div>
            ))}
          </div>
          {alt && alt.euclidean.outOfRange.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {t("Left out because the region is outside Earth's range:")} {alt.euclidean.outOfRange.map((k) => pick(lang, ds.parameters[k]?.label) || k).join(", ")}.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
