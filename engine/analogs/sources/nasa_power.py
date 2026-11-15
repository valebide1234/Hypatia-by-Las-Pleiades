"""Earth surface climate from the NASA POWER API (MERRA-2 reanalysis + CERES SYN1deg).

One request per location returns monthly values for the most recent N complete
years plus the months of the current year that NASA has already published. The
comparison variables are computed here from the complete years, so the averaging
period is explicit and slides forward every year; `rolling_windows` uses every
published month, so it moves forward each time MERRA-2 adds one.

Spatial resolution matters for interpretation: MERRA-2 fields are 0.5 x 0.625 deg
and CERES fields 1 x 1 deg, so values describe the grid cell around a site, not
the microclimate of a specific outcrop.
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from .. import config
from ..provenance import Measurement, Missing
from . import landmask
from .http import SourceError, fetch_json

API = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMS = [
    "TS", "TS_MAX", "TS_MIN", "TS_RANGE", "T2M", "PS", "WS10M", "AOD_55", "PW",
    "ALLSKY_SFC_SW_DWN", "ALLSKY_SRF_ALB", "PRECTOTCORR", "GWETTOP", "RH2M",
    "FROST_DAYS", "ALLSKY_SFC_UV_INDEX", "TOA_SW_DWN",
]
# Units this module knows how to convert. Anything else raises instead of guessing.
EXPECTED_UNITS = {
    "TS": {"C"}, "TS_MAX": {"C"}, "TS_MIN": {"C"}, "TS_RANGE": {"C"}, "T2M": {"C"},
    "PS": {"kPa"}, "WS10M": {"m/s"}, "PW": {"cm"},
    "ALLSKY_SFC_SW_DWN": {"kW-hr/m^2/day"}, "TOA_SW_DWN": {"kW-hr/m^2/day"},
    "PRECTOTCORR": {"mm/day"},
}
R_DRY_AIR = 287.05          # J kg-1 K-1
GRAVITY = 9.80665           # m s-2
LAPSE_RATE = 0.0065         # K/m, standard-atmosphere tropospheric lapse rate
ELEVATION_TOLERANCE_M = 300.0   # larger site-vs-grid-cell differences are corrected
KWH_M2_DAY_TO_W_M2 = 1000.0 / 24.0


def default_period() -> tuple[int, int]:
    end = datetime.now(timezone.utc).year - 1
    return end - config.EARTH_CLIMATE_YEARS + 1, end


def fetch_point(lat: float, lon: float, start: int | None = None, end: int | None = None) -> tuple[dict, dict]:
    """Monthly series for a point. With no period given, the request covers the default
    complete years and the current, still incomplete, year; `meta["period"]` names the
    complete years only (use `complete_years` before `summarize`)."""
    request_end = end
    if start is None or end is None:
        start, end = default_period()
        request_end = end + 1
    payload, meta = fetch_json(
        API,
        source="nasa_power",
        params={
            "parameters": ",".join(PARAMS),
            "community": "RE",
            "longitude": round(float(lon), 4),
            "latitude": round(float(lat), 4),
            "start": start,
            "end": request_end,
            "format": "JSON",
        },
        timeout=180,
    )
    if "properties" not in payload:
        raise SourceError(f"NASA POWER error: {payload.get('messages') or payload.get('header')}")
    for name, allowed in EXPECTED_UNITS.items():
        unit = payload.get("parameters", {}).get(name, {}).get("units")
        if unit not in allowed:
            raise SourceError(f"NASA POWER: unexpected unit '{unit}' for {name}")
    meta["period"] = f"{start}-{end}"
    return payload, meta


def restrict_years(payload: dict, first: int, last: int) -> dict:
    """Copy of a POWER payload keeping only the months and annual values of first..last.

    Lets the same `summarize` code describe a sub-period (for example the newest years)
    of a response that is already in the cache, without another request.
    """
    keep = {str(y) for y in range(first, last + 1)}
    out = dict(payload)
    props = dict(payload["properties"])
    props["parameter"] = {name: {k: v for k, v in series.items() if k[:4] in keep}
                          for name, series in payload["properties"]["parameter"].items()}
    out["properties"] = props
    return out


def complete_years(payload: dict) -> dict:
    """The payload without the current, incomplete year (what `summarize` expects)."""
    start, end = default_period()
    return restrict_years(payload, start, end)


MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
ROLLING = {"tsurf_mean_K": "TS", "precip_mm_yr": "PRECTOTCORR", "pressure_Pa": "PS", "ctx_uv_index": "ALLSKY_SFC_UV_INDEX"}
MIN_MONTH_FRACTION = 0.8      # a window with fewer valid months than this is not reported


def _days(year: int, month: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]


def rolling_windows(payload: dict, recent_months: int = 36, earlier_months: int = 84,
                    dt_K: float = 0.0, pressure_factor: float = 1.0) -> dict:
    """Statistics of the newest `recent_months` published months and of the `earlier_months`
    before them. Both are whole numbers of years, so neither is biased towards a season.

    Only the variables in ROLLING are computed: day-weighted means, and precipitation as a
    yearly total. `dt_K` and `pressure_factor` carry a site's elevation correction.
    """
    raw = payload["properties"]["parameter"]
    fill = payload["header"].get("fill_value", -999.0)

    def value(name: str, y: int, m: int) -> float:
        v = raw[name].get(f"{y}{m:02d}")
        return float("nan") if v is None or v == fill else float(v)

    months = sorted({(int(k[:4]), int(k[4:])) for k in raw["TS"] if k[4:] != "13"})
    published = [ym for ym in months if np.isfinite(value("TS", *ym))]
    if len(published) < recent_months + 12:
        return {}
    last = published[-1]
    upto = months[: months.index(last) + 1]
    recent, earlier = upto[-recent_months:], upto[-(recent_months + earlier_months):-recent_months]

    def stats(window: list[tuple[int, int]]) -> dict[str, float]:
        days = np.array([_days(y, m) for y, m in window], dtype=float)
        out = {}
        for key, name in ROLLING.items():
            x = np.array([value(name, y, m) for y, m in window])
            ok = np.isfinite(x)
            if ok.sum() < MIN_MONTH_FRACTION * len(window):
                out[key] = float("nan")
                continue
            mean = float((x[ok] * days[ok]).sum() / days[ok].sum())
            if key == "tsurf_mean_K":
                out[key] = mean + 273.15 + dt_K
            elif key == "precip_mm_yr":
                out[key] = mean * 365.25
            elif key == "pressure_Pa":
                out[key] = mean * 1000.0 * pressure_factor
            else:
                out[key] = mean
        return out

    def label(window: list[tuple[int, int]]) -> str:
        (y0, m0), (y1, m1) = window[0], window[-1]
        return f"{MONTH_NAMES[m0 - 1]} {y0}–{MONTH_NAMES[m1 - 1]} {y1}"

    return {"recent": stats(recent), "earlier": stats(earlier) if len(earlier) >= 12 else {},
            "recent_label": label(recent), "earlier_label": label(earlier) if len(earlier) >= 12 else "",
            "through": f"{last[0]}-{last[1]:02d}"}


def _series(payload: dict, name: str) -> tuple[np.ndarray, np.ndarray]:
    """Return (monthly [n_years, 12], annual [n_years]) arrays with fill values as NaN."""
    raw = payload["properties"]["parameter"][name]
    fill = payload["header"].get("fill_value", -999.0)
    years = sorted({k[:4] for k in raw})
    monthly = np.full((len(years), 12), np.nan)
    annual = np.full(len(years), np.nan)
    for i, y in enumerate(years):
        for m in range(1, 13):
            v = raw.get(f"{y}{m:02d}")
            if v is not None and v != fill:
                monthly[i, m - 1] = v
        v = raw.get(f"{y}13")
        if v is not None and v != fill:
            annual[i] = v
    return monthly, annual


def _mean(a: np.ndarray) -> float:
    return float(np.nanmean(a)) if np.isfinite(a).any() else float("nan")


def summarize(payload: dict, dz_m: float = 0.0) -> dict[str, float]:
    """Reduce the monthly series to the comparison variables (SI units).

    `dz_m` = site elevation minus the elevation of the reanalysis grid cell. When it is
    not zero, temperatures are shifted with the standard lapse rate and pressure with the
    hypsometric equation, the usual first-order correction for reanalysis data in
    mountainous terrain. Wind, humidity, precipitation and radiation are left as retrieved.
    """
    s = {name: _series(payload, name) for name in PARAMS}
    out: dict[str, float] = {}
    dt = -LAPSE_RATE * dz_m

    ts_m, ts_a = s["TS"][0] + dt, s["TS"][1] + dt
    rng_m, rng_a = s["TS_RANGE"]
    out["tsurf_mean_K"] = _mean(ts_a) + 273.15
    out["tsurf_max_K"] = _mean(s["TS_MAX"][1]) + dt + 273.15      # mean of the annual maxima
    out["tsurf_min_K"] = _mean(s["TS_MIN"][1]) + dt + 273.15      # mean of the annual minima
    out["diurnal_range_K"] = _mean(rng_a)
    t_layer = _mean(s["T2M"][1]) + 273.15 + dt / 2.0             # mean temperature of the layer between both levels
    out["pressure_Pa"] = _mean(s["PS"][1]) * 1000.0 * float(np.exp(-GRAVITY * dz_m / (R_DRY_AIR * t_layer)))
    out["wind_speed_ms"] = _mean(s["WS10M"][1])
    out["insolation_Wm2"] = _mean(s["ALLSKY_SFC_SW_DWN"][1]) * KWH_M2_DAY_TO_W_M2
    out["precip_mm_yr"] = _mean(s["PRECTOTCORR"][1]) * 365.25
    out["soil_wetness"] = _mean(s["GWETTOP"][1])
    out["column_water_vapor_kgm2"] = _mean(s["PW"][1]) * 10.0     # 1 cm of water = 10 kg/m2
    out["dust_optical_depth"] = _mean(s["AOD_55"][1])

    # Albedo: weight each month by its insolation (reflected / incident energy over the
    # year). An unweighted mean would let dark, snowy winter months dominate at high
    # latitude, and the annual value is a fill value wherever there is polar night.
    alb_m = s["ALLSKY_SRF_ALB"][0]
    sw_m = s["ALLSKY_SFC_SW_DWN"][0]
    ok = np.isfinite(alb_m) & np.isfinite(sw_m) & (sw_m > 0)
    out["albedo"] = float((alb_m[ok] * sw_m[ok]).sum() / sw_m[ok].sum()) if ok.any() else float("nan")

    # Mean air density from the ideal gas law, then dynamic pressure of the mean wind.
    t2m_k = _mean(s["T2M"][1]) + 273.15 + dt
    rho = out["pressure_Pa"] / (R_DRY_AIR * t2m_k)
    out["wind_dynamic_pressure_Pa"] = 0.5 * rho * out["wind_speed_ms"] ** 2

    # Share of months whose typical day spans the freezing point:
    # (monthly mean - half the mean daily range) < 0 C < (monthly mean + half the range).
    lo, hi = ts_m - rng_m / 2.0, ts_m + rng_m / 2.0
    valid = np.isfinite(lo) & np.isfinite(hi)
    out["thermal_cycling_273K"] = float(((lo < 0) & (hi > 0) & valid).sum() / valid.sum()) if valid.any() else float("nan")

    # Context variables (reported, not scored).
    out["ctx_air_temp_mean_K"] = t2m_k
    out["ctx_air_density_kgm3"] = rho
    out["ctx_seasonal_range_K"] = float(np.nanmax(np.nanmean(ts_m, axis=0)) - np.nanmin(np.nanmean(ts_m, axis=0)))
    out["ctx_interannual_tsurf_std_K"] = float(np.nanstd(ts_a, ddof=1)) if np.isfinite(ts_a).sum() > 2 else float("nan")
    out["ctx_interannual_precip_cv"] = (
        float(np.nanstd(s["PRECTOTCORR"][1], ddof=1) / np.nanmean(s["PRECTOTCORR"][1]))
        if np.nanmean(s["PRECTOTCORR"][1]) > 0 else float("nan")
    )
    out["ctx_frost_days_per_year"] = _mean(s["FROST_DAYS"][1])
    out["ctx_uv_index"] = _mean(s["ALLSKY_SFC_UV_INDEX"][1])
    out["ctx_rel_humidity_pct"] = _mean(s["RH2M"][1])
    out["ctx_toa_insolation_Wm2"] = _mean(s["TOA_SW_DWN"][1]) * KWH_M2_DAY_TO_W_M2
    out["ctx_grid_elevation_m"] = float(payload["geometry"]["coordinates"][2])
    return out


UNITS = {
    "tsurf_mean_K": "K", "tsurf_max_K": "K", "tsurf_min_K": "K", "diurnal_range_K": "K",
    "pressure_Pa": "Pa", "wind_speed_ms": "m/s", "insolation_Wm2": "W/m2", "precip_mm_yr": "mm/yr",
    "soil_wetness": "0-1", "column_water_vapor_kgm2": "kg/m2", "dust_optical_depth": "-",
    "albedo": "-", "wind_dynamic_pressure_Pa": "Pa", "thermal_cycling_273K": "0-1",
    "ctx_air_temp_mean_K": "K", "ctx_air_density_kgm3": "kg/m3", "ctx_seasonal_range_K": "K",
    "ctx_interannual_tsurf_std_K": "K", "ctx_interannual_precip_cv": "-",
    "ctx_frost_days_per_year": "days/yr", "ctx_uv_index": "UV index", "ctx_rel_humidity_pct": "%",
    "ctx_toa_insolation_Wm2": "W/m2", "ctx_grid_elevation_m": "m", "ctx_land_fraction_1deg": "0-1",
    "ctx_elevation_correction_m": "m",
}
MIN_LAND_FRACTION = 0.6      # below this the 1-degree CERES cell describes ocean, not the site
MEASURED = {"albedo", "insolation_Wm2", "ctx_uv_index", "ctx_toa_insolation_Wm2"}       # CERES satellite products
DERIVED = {"ctx_elevation_correction_m", "ctx_land_fraction_1deg", "wind_dynamic_pressure_Pa", "thermal_cycling_273K", "ctx_air_density_kgm3",
           "ctx_seasonal_range_K", "ctx_interannual_tsurf_std_K", "ctx_interannual_precip_cv"}


def kind_of(parameter: str) -> str:
    if parameter in MEASURED:
        return "measured"
    if parameter in DERIVED:
        return "derived"
    return "reanalysis"


ELEVATION_CORRECTED = {"tsurf_mean_K", "tsurf_max_K", "tsurf_min_K", "pressure_Pa", "wind_dynamic_pressure_Pa",
                       "thermal_cycling_273K", "ctx_air_temp_mean_K", "ctx_air_density_kgm3"}


def measurements(entity_id: str, lat: float, lon: float,
                 site_elevation_m: float | None = None) -> tuple[list[Measurement], list[Missing]]:
    """Climate values for a point. If the site's elevation (from the DEM) differs from the
    reanalysis grid cell by more than ELEVATION_TOLERANCE_M, apply the elevation correction."""
    try:
        payload, meta = fetch_point(lat, lon)
    except SourceError as exc:
        return [], [Missing(entity_id, p, f"NASA POWER no disponible: {exc}", "nasa_power") for p in UNITS]
    grid_elev = float(payload["geometry"]["coordinates"][2])
    dz = 0.0
    if site_elevation_m is not None and np.isfinite(site_elevation_m) and abs(site_elevation_m - grid_elev) > ELEVATION_TOLERANCE_M:
        dz = float(site_elevation_m - grid_elev)
    values = summarize(complete_years(payload), dz)
    if dz:
        values["ctx_elevation_correction_m"] = dz
    out, missing = [], []
    try:
        land = landmask.land_fraction_1deg(lat, lon)
    except Exception:
        land = float("nan")
    if np.isfinite(land):
        values["ctx_land_fraction_1deg"] = land
    for name, value in values.items():
        if name == "albedo" and np.isfinite(land) and land < MIN_LAND_FRACTION:
            missing.append(Missing(entity_id, name, f"celda CERES de 1° con solo {land:.0%} de tierra: "
                                   "el albedo describiría el océano, no el sitio", "nasa_power"))
            continue
        if not np.isfinite(value):
            missing.append(Missing(entity_id, name, "NASA POWER devolvió valor de relleno (sin dato)", "nasa_power"))
            continue
        corrected = bool(dz) and name in ELEVATION_CORRECTED
        note = "Celda de reanálisis MERRA-2 (0.5x0.625°) / CERES SYN1deg (1°)"
        if corrected:
            note += (f"; corregido por elevación: sitio {site_elevation_m:.0f} m, celda {grid_elev:.0f} m "
                     f"(gradiente estándar {LAPSE_RATE * 1000:.1f} K/km y ecuación hipsométrica)")
        out.append(Measurement(
            entity_id, name, float(value), UNITS[name], "derived" if corrected else kind_of(name), "nasa_power",
            url=meta["url"], retrieved_at=meta["retrieved_at"], period=meta["period"], note=note,
        ))
    return out, missing
