import { pick, tx, useLang, useT } from "@/i18n";
import { unitLabel } from "@/lab/format";
import type { LabDataset, SourceLink } from "@/lab/types";
import { Card, Note } from "./ui";

const USED: Record<SourceLink["used"], { label: string; cls: string }> = {
  yes: { label: tx("Used"), cls: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" },
  partial: { label: tx("Used in part"), cls: "border-sky-300/40 bg-sky-300/10 text-sky-100" },
  no: { label: tx("Not used"), cls: "border-slate-300/30 bg-slate-300/10 text-slate-200" },
};
const TRANSFORM = { identity: tx("linear"), log10: tx("logarithmic"), log1p10: tx("logarithmic (1 + x)") } as const;

function LinkCard({ link }: { link: SourceLink }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const used = USED[link.used];
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <a href={link.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-pleiad-300 underline-offset-2 hover:underline">
          {link.title}
          <span className="sr-only"> ({t("opens in a new tab")})</span>
        </a>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${used.cls}`}>{t(used.label)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{pick(lang, link.what)}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{pick(lang, link.how)}</p>
      <p className="mt-2 text-[11px] text-slate-500">
        {link.endpoint && <>{t("Server the engine connects to:")} <span className="text-slate-300">{link.endpoint}</span></>}
        {link.values > 0 && <> · {t("{n} stored values for {e} places and regions", { n: link.values.toLocaleString("en-US"), e: link.entities })}</>}
      </p>
    </li>
  );
}

/** Which pages and services every value came from, how recent they are, what is missing, and the method. */
export default function SourcesTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const s = ds.sources;
  const first = s.links.filter((l) => l.group === "first");
  const additional = s.links.filter((l) => l.group === "additional");
  const numeric = Object.entries(ds.parameters).filter(([, p]) => p.mode !== "ordinal");

  return (
    <div className="space-y-4">
      <Card title={t("Pages and services the engine uses")} tour="lab-sources">
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate-300">
          {t("The engine keeps {n} values. Each one carries the address it was requested from, the date, the period it covers and whether it is measured, modelled or derived. This is the list of the pages given for the challenge and what is taken from each.", { n: s.valuesStored.toLocaleString("en-US") })}
        </p>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("First group of pages")}</h4>
        <ul className="grid gap-3 lg:grid-cols-2">
          {first.map((l) => (
            <LinkCard key={l.id} link={l} />
          ))}
        </ul>
        <h4 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("Additional pages")}</h4>
        <ul className="grid gap-3 lg:grid-cols-2">
          {additional.map((l) => (
            <LinkCard key={l.id} link={l} />
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          {t("Also used:")} {Object.values(s.otherSources).map((x) => pick(lang, x)).join(" · ")} · Copernicus DEM GLO-90 · Natural Earth · OpenStreetMap Nominatim.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("How recent the data are")}>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            {t("Asked to NASA's catalogue (CMR) on {date}. Climate statistics use {start}–{end}.", { date: (s.freshness.checkedAt ?? "").slice(0, 10), start: ds.climatePeriod.start, end: ds.climatePeriod.end })}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-2 font-medium">{t("NASA collection")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Newest data")}</th>
              </tr>
            </thead>
            <tbody>
              {s.freshness.collections.map((c) => (
                <tr key={c.shortName} className="border-t border-white/5">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-200" title={c.title}>{c.shortName} <span className="text-slate-500">v{c.version}</span></th>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">{(c.latest ?? "—").slice(0, 10)}</td>
                </tr>
              ))}
              {s.freshness.archives.map((a) => (
                <tr key={a.url} className="border-t border-white/5">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-200">{pick(lang, a.label)}</th>
                  <td className="py-1.5 text-right text-slate-300">{a.lastModified ? new Date(a.lastModified).toISOString().slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t("What could not be retrieved")}>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">{t("A value that cannot be retrieved is reported here and left out of the score. It is never filled in.")}</p>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-300">
            {s.missing.map((m, i) => (
              <li key={i}>
                <strong className="text-slate-100">{pick(lang, m.entity)}</strong> · {pick(lang, m.parameter)}: {pick(lang, m.reason)}
              </li>
            ))}
            {s.missing.length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </Card>
      </div>

      <Card title={t("The method, in full")}>
        <div className="grid gap-4 text-sm leading-relaxed text-slate-300 md:grid-cols-2">
          <div className="space-y-2">
            <p>{t("For each numeric parameter the difference between the Earth value and the region's value is divided by a tolerance, and turned into a similarity between 0 and 1:")}</p>
            <p className="rounded-lg bg-space-800 px-3 py-2 font-mono text-xs text-slate-100">d = |f(x_Earth) − f(x_region)| / tolerance&nbsp;&nbsp;&nbsp;s = exp(−d² / 2)</p>
            <p>{t("At a difference of one tolerance the similarity is 0.61; at two it is 0.14. Geological descriptors are coded absent, present or dominant from the literature, and compared as s = 1 − |a − b|; a feature absent on both sides is not counted as a similarity.")}</p>
          </div>
          <div className="space-y-2">
            <p>{t("Parameters are averaged inside four categories (geology, topography, environment, water and ice), and the categories are combined with weights that depend on what you want to test.")}</p>
            <p>{t("Terrain is always measured the same way on the three bodies: a {w} km window resampled to a {b} m baseline, from Copernicus DEM (Earth), LOLA (Moon) and MOLA (Mars).", { w: ds.windowKm, b: ds.baselineM })}</p>
            <p>{t("Confidence is the share of the weight for which both sides have data, multiplied by the quality of those data: measured 1, reanalysis 0.85, literature 0.75, modelled or derived 0.7, coded from literature 0.6.")}</p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-xs">
            <caption className="mb-2 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("Tolerances of the numeric parameters")}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-2 font-medium">{t("Parameter")}</th>
                <th scope="col" className="pb-2 font-medium">{t("Category")}</th>
                <th scope="col" className="pb-2 font-medium">{t("Scale")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Tolerance")}</th>
                <th scope="col" className="pb-2 pl-3 font-medium">{t("Compared for")}</th>
              </tr>
            </thead>
            <tbody>
              {numeric.map(([k, p]) => (
                <tr key={k} className="border-t border-white/5">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-200" title={pick(lang, p.note) || undefined}>{pick(lang, p.label)}</th>
                  <td className="py-1.5 text-slate-400">{pick(lang, ds.categories[p.category].label)}</td>
                  <td className="py-1.5 text-slate-400">{t(TRANSFORM[p.transform])}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">
                    {p.scale} {p.transform === "identity" ? unitLabel(p.unit) : t("decades")}
                  </td>
                  <td className="py-1.5 pl-3 text-slate-400">{p.appliesTo.map((b) => t(b === "moon" ? tx("Moon") : tx("Mars"))).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Note>{t("Tolerances and weights are explicit choices of method, not data. They are written in engine/config and can be changed there.")}</Note>
        </div>
      </Card>
    </div>
  );
}
