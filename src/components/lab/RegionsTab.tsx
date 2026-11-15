import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { pick, useLang, useT } from "@/i18n";
import { asset } from "@/lib/asset";
import { discoverForRegion } from "@/lab/bridge";
import { rankPlaces } from "@/lab/scoring";
import { useLab } from "@/lab/store";
import type { LabDataset, Region } from "@/lab/types";
import { useSelection } from "@/lab/useSelection";
import type { Target } from "@/types/site";
import { CHART, Card } from "./ui";

const MAP: Record<Target, { src: string; credit: string }> = {
  moon: { src: "/images/bodies/moon-equirectangular.jpg", credit: "LRO Wide Angle Camera global mosaic, via NASA Moon Trek. Credit: NASA / GSFC / Arizona State University." },
  mars: { src: "/images/bodies/mars-equirectangular.jpg", credit: "Viking MDIM 2.1 colour mosaic, via NASA Mars Trek. Credit: NASA / JPL / USGS." },
};

/** Position of a region on a whole-body map centred on longitude 0 (east-positive longitudes). */
export function mapPosition(region: Pick<Region, "lat" | "lon">): { x: number; y: number } {
  const lon = (((region.lon + 180) % 360) + 360) % 360;
  return { x: (lon / 360) * 100, y: Math.min(97, Math.max(3, ((90 - region.lat) / 180) * 100)) };
}

const fact = (v: number | undefined, digits = 0) => (v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));

/** Where the missions go: the regions of the Moon or Mars that Earth is compared with. */
export default function RegionsTab({ ds, onCompare }: { ds: LabDataset; onCompare: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const navigate = useNavigate();
  const { places, region, objectiveId } = useSelection(ds);
  const { target, select } = useLab();
  const regions = ds.regions.filter((r) => r.target === target);
  const best = useMemo(() => rankPlaces(ds, places, region, objectiveId).filter((r) => r.result.score !== null).slice(0, 3), [ds, places, region, objectiveId]);
  const f = region.features;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card title={target === "moon" ? t("Regions of the Moon") : t("Regions of Mars")} tour="lab-regions">
        <figure>
          <div className="relative overflow-hidden rounded-xl border border-white/10">
            <img src={asset(MAP[target].src)} alt={target === "moon" ? t("Map of the whole Moon") : t("Map of the whole of Mars")} className="block w-full" />
            {regions.map((r) => {
              const { x, y } = mapPosition(r);
              const on = r.id === region.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => select({ regionId: r.id })}
                  aria-pressed={on}
                  aria-label={pick(lang, r.name)}
                  title={pick(lang, r.name)}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 p-1.5"
                  style={{ left: `${x}%`, top: `${y}%`, zIndex: on ? 2 : 1 }}
                >
                  <span className={`block rotate-45 border-2 border-space-950 ${on ? "h-4 w-4" : "h-3 w-3 opacity-90 group-hover:opacity-100"}`} style={{ backgroundColor: on ? CHART.region : "#f8fafc" }} />
                </button>
              );
            })}
          </div>
          <figcaption className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {t("Each diamond is a region the engine compares Earth with. Click one to select it.")} {MAP[target].credit}
          </figcaption>
        </figure>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {regions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => select({ regionId: r.id })}
                aria-current={r.id === region.id}
                className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5 ${r.id === region.id ? "bg-white/10" : ""}`}
              >
                <span className="min-w-0 truncate text-slate-100">{pick(lang, r.name)}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{r.program}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card title={region.program}>
          <h4 className="font-display text-2xl leading-tight text-white">{pick(lang, region.name)}</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{pick(lang, region.summary)}</p>
          {region.notes && <p className="mt-2 text-xs leading-relaxed text-slate-400">{pick(lang, region.notes)}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-slate-400">{t("Coordinates")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{region.lat.toFixed(2)}°, {region.lon.toFixed(2)}° E</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t("Mean surface temperature")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{f.tsurf_mean_K === undefined ? "—" : `${fact(f.tsurf_mean_K - 273.15)} °C`}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t("Surface pressure")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{f.pressure_Pa === undefined ? "—" : f.pressure_Pa < 1 ? t("vacuum") : `${fact(f.pressure_Pa)} Pa`}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t("Day–night temperature range")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{f.diurnal_range_K === undefined ? "—" : `${fact(f.diurnal_range_K)} K`}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t("Mean slope (463 m baseline)")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{f.slope_mean_deg === undefined ? "—" : `${fact(f.slope_mean_deg, 1)}°`}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t("Relief in a 40 km window (P95–P5)")}</dt>
              <dd className="mt-0.5 tabular-nums text-white">{f.relief_m === undefined ? "—" : `${fact(f.relief_m)} m`}</dd>
            </div>
          </dl>
          {region.coordSource && <p className="mt-3 text-[11px] text-slate-500">{pick(lang, region.coordSource)}</p>}
        </Card>

        <Card title={t("Best known places for this region")}>
          <ol className="space-y-1 text-xs">
            {best.map((r, i) => (
              <li key={r.place.id}>
                <button
                  type="button"
                  onClick={() => {
                    select({ placeId: r.place.id });
                    onCompare();
                  }}
                  className="flex w-full justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                >
                  <span className="min-w-0 truncate text-slate-100">{i + 1}. {pick(lang, r.place.name)}</span>
                  <span className="shrink-0 tabular-nums text-white">{r.result.score!.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onCompare} className="rounded-full bg-pleiad-300 px-3 py-1.5 text-xs font-semibold text-space-950 hover:bg-white">
              {t("Compare in full")}
            </button>
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
          </div>
        </Card>
      </div>
    </div>
  );
}
