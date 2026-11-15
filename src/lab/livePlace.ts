import { tx } from "@/i18n";
import type { Place, ValueKind } from "./types";

/**
 * Adds a place to the Lab from live data: the name is looked up with OpenStreetMap's Nominatim
 * and its climate is requested from NASA POWER (MERRA-2 and CERES) by the browser, then reduced
 * to the engine's comparison variables with the same formulas as
 * engine/analogs/sources/nasa_power.py.
 *
 * Terrain is not retrieved (reading the Copernicus DEM needs the Python engine), there is no
 * elevation correction, and a coastal grid cell can describe the sea. The place says so.
 */

const POWER_API = "https://power.larc.nasa.gov/api/temporal/monthly/point";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PARAMS = ["TS", "TS_MAX", "TS_MIN", "TS_RANGE", "T2M", "PS", "WS10M", "AOD_55", "PW", "ALLSKY_SFC_SW_DWN", "ALLSKY_SRF_ALB", "PRECTOTCORR", "GWETTOP", "ALLSKY_SFC_UV_INDEX"];
const YEARS = 10;
const R_DRY_AIR = 287.05;

export interface Located {
  name: string;
  lat: number;
  lon: number;
  /** How the coordinates were obtained. */
  via: "coordinates" | "openstreetmap";
}

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const m = COORDS.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

/** Coordinates typed as "lat, lon", or a place name looked up with OpenStreetMap. */
export async function locate(query: string, lang = "en", signal?: AbortSignal): Promise<Located> {
  const c = parseCoordinates(query);
  if (c) return { name: `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`, ...c, via: "coordinates" };
  const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=${lang}&q=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OpenStreetMap could not be reached (HTTP ${res.status}).`);
  const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = hits[0];
  if (!hit) throw new Error("No place with that name was found. Try another name, or type coordinates as latitude, longitude.");
  return { name: hit.display_name.split(",").slice(0, 2).join(",").trim(), lat: Number(hit.lat), lon: Number(hit.lon), via: "openstreetmap" };
}

export interface PowerPayload {
  header?: { fill_value?: number };
  messages?: string[];
  geometry?: { coordinates: number[] };
  properties?: { parameter: Record<string, Record<string, number>> };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** The engine's comparison variables from a NASA POWER monthly response (complete years only). */
export function summarizePower(payload: PowerPayload, firstYear: number, lastYear: number): Record<string, number> {
  const raw = payload.properties?.parameter;
  if (!raw) throw new Error("NASA POWER returned no data for this point.");
  const fill = payload.header?.fill_value ?? -999;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const at = (name: string, key: string) => {
    const v = raw[name]?.[key];
    return v === undefined || v === fill ? NaN : v;
  };
  const annual = (name: string) => mean(years.map((y) => at(name, `${y}13`)).filter(Number.isFinite));
  const months = years.flatMap((y) => Array.from({ length: 12 }, (_, m) => `${y}${String(m + 1).padStart(2, "0")}`));

  const out: Record<string, number> = {};
  out.tsurf_mean_K = annual("TS") + 273.15;
  out.tsurf_max_K = annual("TS_MAX") + 273.15;
  out.tsurf_min_K = annual("TS_MIN") + 273.15;
  out.diurnal_range_K = annual("TS_RANGE");
  out.pressure_Pa = annual("PS") * 1000;
  out.wind_speed_ms = annual("WS10M");
  out.insolation_Wm2 = (annual("ALLSKY_SFC_SW_DWN") * 1000) / 24;
  out.precip_mm_yr = annual("PRECTOTCORR") * 365.25;
  out.soil_wetness = annual("GWETTOP");
  out.column_water_vapor_kgm2 = annual("PW") * 10;
  out.dust_optical_depth = annual("AOD_55");
  out.ctx_uv_index = annual("ALLSKY_SFC_UV_INDEX");

  // Albedo weighted by each month's sunlight (reflected / incident energy over the year).
  let reflected = 0;
  let incident = 0;
  for (const k of months) {
    const a = at("ALLSKY_SRF_ALB", k);
    const sw = at("ALLSKY_SFC_SW_DWN", k);
    if (Number.isFinite(a) && Number.isFinite(sw) && sw > 0) {
      reflected += a * sw;
      incident += sw;
    }
  }
  out.albedo = incident > 0 ? reflected / incident : NaN;

  // Dynamic pressure of the mean wind, with air density from the ideal gas law.
  const rho = out.pressure_Pa / (R_DRY_AIR * (annual("T2M") + 273.15));
  out.wind_dynamic_pressure_Pa = 0.5 * rho * out.wind_speed_ms ** 2;

  // Share of months whose typical day spans the freezing point.
  let crossing = 0;
  let valid = 0;
  for (const k of months) {
    const ts = at("TS", k);
    const range = at("TS_RANGE", k);
    if (!Number.isFinite(ts) || !Number.isFinite(range)) continue;
    valid++;
    if (ts - range / 2 < 0 && ts + range / 2 > 0) crossing++;
  }
  out.thermal_cycling_273K = valid ? crossing / valid : NaN;

  for (const k of Object.keys(out)) if (!Number.isFinite(out[k])) delete out[k];
  if (out.tsurf_mean_K === undefined) throw new Error("NASA POWER returned no temperature for this point.");
  return out;
}

const MEASURED = new Set(["albedo", "insolation_Wm2", "ctx_uv_index"]); // CERES satellite products
const DERIVED = new Set(["wind_dynamic_pressure_Pa", "thermal_cycling_273K"]);

export function kindOf(parameter: string): ValueKind {
  return MEASURED.has(parameter) ? "measured" : DERIVED.has(parameter) ? "derived" : "reanalysis";
}

export const USER_PLACE_NOTES = [
  tx("Added in the Lab: climate retrieved live from NASA POWER. Terrain was not retrieved, so topography is not scored and the confidence is lower."),
  tx("Geological descriptors have not been coded for this place, so geology is not scored."),
  tx("No elevation correction and no check of how much of the grid cell is land: on a coast or an island the values can describe the sea."),
];

/** Requests NASA POWER for a located point and returns it as a Lab place. */
export async function fetchLivePlace(located: Located, now = new Date(), signal?: AbortSignal): Promise<Place> {
  const last = now.getUTCFullYear() - 1;
  const first = last - YEARS + 1;
  const url = `${POWER_API}?parameters=${PARAMS.join(",")}&community=RE&longitude=${located.lon.toFixed(4)}&latitude=${located.lat.toFixed(4)}&start=${first}&end=${last}&format=JSON`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`NASA POWER could not be reached (HTTP ${res.status}).`);
  const features = summarizePower((await res.json()) as PowerPayload, first, last);
  const kinds = Object.fromEntries(Object.keys(features).map((k) => [k, kindOf(k)]));
  const src = Object.fromEntries(Object.keys(features).map((k) => [k, "nasa_power"]));
  return {
    id: `user:${located.lat.toFixed(3)},${located.lon.toFixed(3)}`,
    group: "user",
    name: { en: located.name },
    country: null,
    lat: located.lat,
    lon: located.lon,
    targets: ["moon", "mars"],
    features,
    kinds,
    src,
    notes: USER_PLACE_NOTES,
    retrievedAt: now.toISOString(),
    period: `${first}–${last}`,
  };
}
