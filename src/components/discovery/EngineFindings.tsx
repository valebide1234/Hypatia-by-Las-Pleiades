import StrengthBadge from "@/components/site/StrengthBadge";
import { QUALITY_BY_ID } from "@/data/qualities";
import { cellIdOf, checkText } from "@/discovery/engine/buildCandidates";
import type { EngineDataset, EvidenceKind, SiteCheck } from "@/discovery/engine/types";
import { useEngine } from "@/store/engine";
import type { AnalogSite, Target } from "@/types/site";
import { dateLabel, monthLabel } from "./EngineStatus";
import { useNavigate } from "react-router-dom";
import { tx, useT } from "@/i18n";
import { openInLab } from "@/lab/bridge";

const KIND_LABEL: Record<EvidenceKind, string> = {
  measured: tx("Measured"),
  reanalysis: tx("Reanalysis"),
  derived: tx("Derived"),
  inferred: tx("Inferred"),
};
const KIND_HELP: Record<EvidenceKind, string> = {
  measured: tx("Satellite product retrieved from the archive"),
  reanalysis: tx("MERRA-2: a model constrained by observations"),
  derived: tx("Computed here from retrieved values"),
  inferred: tx("A conclusion drawn from the retrieved values, not an observation"),
};
const KIND_CLASS: Record<EvidenceKind, string> = {
  measured: "border-emerald-300/40 text-emerald-100",
  reanalysis: "border-sky-300/40 text-sky-100",
  derived: "border-slate-300/40 text-slate-200",
  inferred: "border-amber-300/50 text-amber-100",
};

function KindChip({ kind }: { kind: EvidenceKind }) {
  const t = useT();
  return (
    <span title={t(KIND_HELP[kind])} className={`inline-block shrink-0 rounded border px-1.5 text-[10px] uppercase tracking-wider ${KIND_CLASS[kind]}`}>
      {t(KIND_LABEL[kind])}
    </span>
  );
}

function ValuesTable({ ds, values, corrected }: { ds: EngineDataset; values: Record<string, number>; corrected?: boolean }) {
  const t = useT();
  const rows = Object.keys(ds.valueMeta).filter((k) => values[k] != null);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">{t("Retrieved values")}</caption>
      <tbody>
        {rows.map((k) => {
          const meta = ds.valueMeta[k]!;
          const kind: EvidenceKind = corrected && meta.elevationCorrected ? "derived" : meta.kind;
          return (
            <tr key={k} className="border-t border-white/5">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-300">
                {t(meta.label)}
                <span className="block text-[10px] text-slate-500">{meta.source}</span>
              </th>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-white">
                {values[k]!.toLocaleString("en-US")} {meta.unit}
              </td>
              <td className="py-1.5 text-right">
                <KindChip kind={kind} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CheckItem({ ds, siteId, check, tone }: { ds: EngineDataset; siteId: string; check: SiteCheck; tone: "new" | "ok" | "warn" }) {
  const t = useT();
  const finding = ds.siteFindings[siteId]!;
  const cls = tone === "new" ? "border-amber-300/40 bg-amber-300/[0.07]" : "border-white/10 bg-white/[0.03]";
  return (
    <li className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-white">{t(QUALITY_BY_ID.get(check.qualityId)?.label ?? check.qualityId)}</span>
        <span className="flex items-center gap-1.5">
          {check.basis && <KindChip kind={check.basis} />}
          {check.strength && <StrengthBadge strength={check.strength} />}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{checkText(ds, finding, check)}</p>
    </li>
  );
}

const heading = "mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400";

/**
 * What the Hypatia engine retrieved for the selected site: for a catalogued site, the uses the
 * data suggest beyond the catalogue, the entries the data confirm and the closest mission
 * regions; for a candidate, the values behind the proposal.
 */
export default function EngineFindings({ site, target }: { site: AnalogSite; target: Target }) {
  const t = useT();
  const navigate = useNavigate();
  const ds = useEngine((s) => s.dataset);
  if (!ds) return null;

  const cellId = cellIdOf(site.id);
  const cell = cellId ? ds.cells[cellId] : undefined;
  const finding = cell ? undefined : ds.siteFindings[site.id];
  if (!cell && !finding) return null;

  const checks = finding?.checks.filter((c) => c.target === target) ?? [];
  const newUses = checks.filter((c) => c.status === "new_use");
  const confirmed = checks.filter((c) => c.status === "confirmed");
  const unsupported = checks.filter((c) => c.status === "not_supported");
  const regions = finding?.regions[target] ?? [];
  const values = cell?.values ?? finding?.values ?? {};
  const body = target === "moon" ? t("the Moon") : t("Mars");

  return (
    <section aria-labelledby="engine-findings-title" data-tour="engine-findings" className="rounded-xl border border-white/10 bg-space-800/40 p-4">
      <h3 id="engine-findings-title" className="flex items-center gap-2 text-sm font-semibold text-white">
        <span aria-hidden="true" className="text-amber-300">◆</span> {t("Hypatia engine: what NASA data say here")}
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        {t("Retrieved for this location, not taken from the catalogue. Climate {start}–{end}, newest month {month}; engine run {date}.", { start: ds.climatePeriod.start, end: ds.climatePeriod.end, month: monthLabel(ds.windows.through), date: dateLabel(ds.generatedAt) })}
      </p>

      <div className="mt-4 space-y-5">
        {newUses.length > 0 && (
          <div>
            <h4 className={heading}>{t("New reasons to use this site")}</h4>
            <p className="mb-2 text-xs leading-relaxed text-amber-100/90">
              {t("The data support qualities that the catalogue does not list for {body}. Unverified suggestions: they do not change the catalogue or the ranking.", { body })}
            </p>
            <ul className="space-y-2">
              {newUses.map((c) => (
                <CheckItem key={c.qualityId} ds={ds} siteId={site.id} check={c} tone="new" />
              ))}
            </ul>
          </div>
        )}

        {confirmed.length > 0 && (
          <div>
            <h4 className={heading}>{t("Catalogue entries the data support")}</h4>
            <ul className="space-y-2">
              {confirmed.map((c) => (
                <CheckItem key={c.qualityId} ds={ds} siteId={site.id} check={c} tone="ok" />
              ))}
            </ul>
          </div>
        )}

        {unsupported.length > 0 && (
          <div>
            <h4 className={heading}>{t("Data check")}</h4>
            <ul className="space-y-2">
              {unsupported.map((c) => (
                <li key={c.qualityId} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs leading-relaxed text-slate-300">
                  <span className="font-medium text-white">{t(QUALITY_BY_ID.get(c.qualityId)?.label ?? c.qualityId)}:</span> {t("the catalogue lists it.")} {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {regions.length > 0 && (
          <div>
            <h4 className={heading}>{t("Closest mission regions on {body}", { body })}</h4>
            <ul className="space-y-1.5">
              {regions.map((r) => {
                const region = ds.regions.find((x) => x.id === r.id);
                if (!region) return null;
                return (
                  <li key={r.id}>
                   <button
                    type="button"
                    onClick={() => openInLab(site.id, target, r.id) && navigate("/lab")}
                    title={t("Open this comparison in the Lab")}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left text-xs hover:bg-white/5"
                   >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-100">{t(region.name)}</span>
                      <span className="block text-[10px] text-slate-500">
                        {region.program}
                        {r.topo != null && ` · ${t("terrain alone")} ${Math.round(r.topo * 100)}%`}
                      </span>
                    </span>
                    <span className="w-28 shrink-0 text-right tabular-nums text-slate-300">
                      {Math.round(r.score * 100)}% {t("similar")}
                      <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-space-700">
                        <span className="block h-full bg-pleiad-400" style={{ width: `${r.score * 100}%` }} />
                      </span>
                    </span>
                   </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {t("Measured environment, water and terrain only; geology is not part of this score, and no place on Earth matches the temperature or pressure of {body}, so terrain weighs most. A score ranks regions; it does not make a place equivalent to {body}.", { body })}
            </p>
          </div>
        )}

        {cell && (
          <p className="text-xs leading-relaxed text-slate-300">
            {t("Nearest known analog: {name}, {km} km away.", { name: cell.nearest.name, km: cell.nearest.km.toLocaleString("en-US") })}
            {cell.environment && cell.rarity != null && (
              <> {t("Environment type: {type}; rarer than {r}% of Earth's land grid cells.", { type: cell.environment, r: Math.round(cell.rarity * 100) })}</>
            )}
          </p>
        )}

        {Object.keys(values).length > 0 && (
          <div>
            <h4 className={heading}>{t("Retrieved values")}</h4>
            <ValuesTable ds={ds} values={values} corrected={finding?.elevationCorrected} />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {t("Climate values describe a grid cell about 50 km wide; terrain is measured over a {w} km window. Hover a label on the right to see what it means.", { w: ds.grid.windowKm })}
            </p>
          </div>
        )}

        {(finding?.notes.length ?? 0) > 0 && (
          <ul className="space-y-1 text-[11px] leading-relaxed text-slate-400">
            {finding!.notes.map((n) => (
              <li key={n}>{t("Note")}: {n}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
