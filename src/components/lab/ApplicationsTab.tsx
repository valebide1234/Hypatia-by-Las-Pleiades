import { useMemo } from "react";
import { pick, useLang, useT } from "@/i18n";
import { bodyName } from "@/lab/report";
import { feasibleOnEarth, notReproducible, scorePair, suggestExperiments } from "@/lab/scoring";
import { useLab } from "@/lab/store";
import type { LabDataset } from "@/lab/types";
import { useSelection } from "@/lab/useSelection";
import { Card, Note } from "./ui";

/** What the selected pair can be used for, what Earth cannot reproduce, and the best pair for each kind of test. */
export default function ApplicationsTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { places, place, region, objectiveId, result } = useSelection(ds);
  const select = useLab((s) => s.select);
  const body = t(bodyName(region.target));
  const objective = pick(lang, ds.objectives[objectiveId]!.label);
  const suggested = suggestExperiments(ds, result);
  const feasible = feasibleOnEarth(ds, objectiveId);
  const limits = notReproducible(ds, region.target, objectiveId);
  const earth = ds.applications.bodies.earth;
  const other = ds.applications.bodies[region.target];

  // For every kind of test, the best known place–region pair on this body.
  const best = useMemo(() => {
    const regions = ds.regions.filter((r) => r.target === region.target);
    return Object.keys(ds.objectives)
      .filter((o) => o !== "balanced" && o !== "custom")
      .map((o) => {
        let top: { place: (typeof places)[number]; region: (typeof regions)[number]; score: number; confidence: number } | null = null;
        for (const p of places) {
          for (const r of regions) {
            const s = scorePair(ds, p, r, o);
            if (s.score !== null && s.confidence >= 0.6 && (!top || s.score > top.score)) top = { place: p, region: r, score: s.score, confidence: s.confidence };
          }
        }
        return { objective: o, top };
      });
  }, [ds, places, region.target]);

  const facts: [string, string, string][] = [
    [t("Surface gravity"), `${earth.gravity} m/s²`, `${other.gravity} m/s²`],
    [t("Mean surface pressure"), earth.pressurePa ? `${Math.round(earth.pressurePa / 100) / 10} kPa` : "—", other.pressurePa ? `${other.pressurePa} Pa` : t("vacuum")],
    [t("Sunlight above the atmosphere"), `${Math.round(earth.solarConstant)} W/m²`, `${Math.round(other.solarConstant)} W/m²`],
    [t("Length of the solar day"), `${earth.solarDayHours} h`, `${other.solarDayHours} h`],
    [t("Atmosphere"), pick(lang, earth.atmosphere), pick(lang, other.atmosphere)],
    [t("Radiation at the surface"), pick(lang, earth.radiation), pick(lang, other.radiation)],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("What this pair can be used for")} tour="lab-applications">
          <p className="mb-2 text-xs text-slate-400">
            {pick(lang, place.name)} ↔ {pick(lang, region.name)}
          </p>
          {suggested.length ? (
            <>
              <p className="text-sm text-slate-300">{t("Supported by features the site and the region share:")}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300 marker:text-slate-500">
                {suggested.map((s) => (
                  <li key={s.en}>{pick(lang, s)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-slate-300">{t("The compared data do not support specific experiments for this pair.")}</p>
          )}
          {feasible.length > 0 && (
            <>
              <p className="mt-4 text-sm text-slate-300">{t("Field tests that are feasible for the objective “{objective}”:", { objective })}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300 marker:text-slate-500">
                {feasible.map((s) => (
                  <li key={s.en}>{pick(lang, s)}</li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title={t("What no place on Earth can reproduce")}>
          <p className="mb-2 text-xs text-slate-400">{objectiveId === "balanced" || objectiveId === "custom" ? t("For {body}, whatever the test:", { body }) : t("For {body}, and relevant to “{objective}”:", { body, objective })}</p>
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-300">
            {limits.map((i) => (
              <li key={i.item.en} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                <span>
                  <strong className="text-white">{pick(lang, i.item)}.</strong> {pick(lang, i.why)}
                </span>
              </li>
            ))}
            {limits.length === 0 && <li className="text-slate-500">—</li>}
          </ul>
          <div className="mt-4">
            <Note>{t("These limits hold for every analog. A test done on Earth must be completed with chambers, simulations or flight data for what the field cannot give.")}</Note>
          </div>
        </Card>
      </div>

      <Card title={t("Earth and {body}, side by side", { body })}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="pb-2 font-medium" />
              <th scope="col" className="pb-2 font-medium">{t("Earth")}</th>
              <th scope="col" className="pb-2 font-medium">{body}</th>
            </tr>
          </thead>
          <tbody>
            {facts.map(([name, a, b]) => (
              <tr key={name} className="border-t border-white/5 align-top">
                <th scope="row" className="w-1/4 py-2 pr-3 text-left font-normal text-slate-400">{name}</th>
                <td className="py-2 pr-3 text-slate-200">{a}</td>
                <td className="py-2 text-slate-200">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={t("Best known pair for each kind of test on {body}", { body })}>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">{t("Among the known places, with at least medium confidence. Click a row to study that pair.")}</p>
        <ul className="divide-y divide-white/5">
          {best.map(({ objective: o, top }) => (
            <li key={o}>
              <button
                type="button"
                disabled={!top}
                onClick={() => top && select({ placeId: top.place.id, regionId: top.region.id, objectiveId: o })}
                className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,5fr)_auto] items-center gap-3 px-1 py-2 text-left text-xs hover:bg-white/5 disabled:hover:bg-transparent"
              >
                <span className="text-slate-100">{pick(lang, ds.objectives[o]!.label)}</span>
                <span className="min-w-0 truncate text-slate-300">{top ? `${pick(lang, top.place.name)} ↔ ${pick(lang, top.region.name)}` : t("No pair with enough data")}</span>
                <span className="tabular-nums text-white">{top ? top.score.toFixed(2) : "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
