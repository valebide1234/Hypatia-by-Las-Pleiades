import { useState } from "react";
import { useT } from "@/i18n";
import { earthdataSearchLink, worldviewLink } from "@/lab/report";
import { Card } from "./ui";

const SNAPSHOTS = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";
const LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor";
const HALF_DEG = 0.45;

/** A day that the satellite has certainly imaged and NASA has already published (UTC). */
export function snapshotDay(now = new Date(), daysBack = 2): string {
  return new Date(now.getTime() - daysBack * 86_400_000).toISOString().slice(0, 10);
}

/** Request for a NASA Worldview snapshot of about 100 × 100 km around a point. */
export function snapshotUrl(lat: number, lon: number, day: string, size = 512): string {
  const halfLon = Math.min(20, HALF_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
  const south = Math.max(-90, lat - HALF_DEG);
  const north = Math.min(90, lat + HALF_DEG);
  const bbox = `${south.toFixed(4)},${(lon - halfLon).toFixed(4)},${north.toFixed(4)},${(lon + halfLon).toFixed(4)}`;
  return `${SNAPSHOTS}?REQUEST=GetSnapshot&TIME=${day}&CRS=EPSG:4326&BBOX=${bbox}&LAYERS=${LAYER}&FORMAT=image/jpeg&WIDTH=${size}&HEIGHT=${size}`;
}

/**
 * The selected place as NASA's Terra satellite saw it a couple of days ago, requested live from
 * NASA Worldview. It is a current image, not a curated one: clouds can cover the place, and near
 * the poles in winter the image is dark.
 */
export default function SatelliteView({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const t = useT();
  const [back, setBack] = useState(2);
  const [failed, setFailed] = useState<string | null>(null);
  const day = snapshotDay(new Date(), back);
  const url = snapshotUrl(lat, lon, day);

  return (
    <Card title={t("The place from space, this week")} tour="lab-satellite">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <div className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-space-800">
          {failed === url ? (
            <p className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">{t("NASA Worldview did not return an image for this day.")}</p>
          ) : (
            <img key={url} src={url} alt={t("Satellite image of {name} on {day}", { name, day })} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(url)} />
          )}
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>
            {t("{name} on {day}, about 100 km across, as seen by the MODIS instrument on NASA's Terra satellite. The image is requested from NASA Worldview when you open this page.", { name, day })}
          </p>
          <p className="text-slate-400">{t("It is a current image, not a chosen one: clouds may hide the ground, and polar places are dark in winter.")}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => setBack((b) => b + 1)} className="rounded-full border border-white/20 px-3 py-1 text-slate-200 hover:border-white/50">
              ← {t("Previous day")}
            </button>
            <button type="button" onClick={() => setBack((b) => Math.max(2, b - 1))} disabled={back <= 2} className="rounded-full border border-white/20 px-3 py-1 text-slate-200 hover:border-white/50 disabled:opacity-40">
              {t("Next day")} →
            </button>
            <a href={worldviewLink(lat, lon)} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
              NASA Worldview
            </a>
            <a href={earthdataSearchLink(lat, lon)} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
              Earthdata Search
            </a>
          </div>
          <p className="text-[11px] text-slate-500">{t("Imagery: NASA Worldview Snapshots, MODIS Terra corrected reflectance (true colour). Credit: NASA EOSDIS.")}</p>
        </div>
      </div>
    </Card>
  );
}
