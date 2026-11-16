import { PinIcon } from "@/components/globe/SitesOverlay";
import { isBehindNasa, useEngine } from "@/store/engine";
import { useT } from "@/i18n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "Sep 2026". */
export function monthLabel(ym: string | null | undefined): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y}`.trim();
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** What the engine is, how recent its data are, and whether NASA has published newer data since. */
export default function EngineStatus() {
  const t = useT();
  const { dataset, status, error, nasaLatest } = useEngine();
  const behind = isBehindNasa(dataset, nasaLatest);

  return (
    <div data-tour="engine-status" className="rounded-xl border border-amber-300/50 bg-amber-300/[0.06] p-4">
      <p className="flex items-center gap-2 font-semibold text-amber-100">
        <PinIcon origin="hypatia_candidate" scale={0.5} /> {t("Hypatia engine: new analogs from NASA data")}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed">
        {t("The engine describes Earth's land with NASA satellite and reanalysis data, compares it with the regions where Artemis and the Mars missions operate, and proposes places that are not in any analog catalogue, plus new uses for the sites that are. Results are amber Hypatia candidates: unverified, ranked with the same rules as known sites.")}
      </p>
      <div className="mt-2.5 text-[11px] leading-relaxed text-slate-300" aria-live="polite">
        {status === "loading" && <p>{t("Loading the engine's data…")}</p>}
        {status === "error" && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
        {dataset && (
          <ul className="space-y-0.5">
            <li>
              {t("Climate statistics: {start}–{end}. Newest month included: {month}. Engine run: {date}.", { start: dataset.climatePeriod.start, end: dataset.climatePeriod.end, month: monthLabel(dataset.windows.through), date: dateLabel(dataset.generatedAt) })}
            </li>
            {nasaLatest && (
              <li className={behind ? "text-amber-200" : "text-emerald-200"}>
                <span aria-hidden="true">{behind ? "↻ " : "✓ "}</span>
                {t("Asked NASA just now: its archive reaches {month}.", { month: monthLabel(nasaLatest) })}{" "}
                {behind ? t("That is newer than this run; the next engine update will include it.") : t("This run includes it.")}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
