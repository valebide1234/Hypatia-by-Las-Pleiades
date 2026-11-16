"""Mars near-surface climate from the Mars Climate Database (MCD) web interface.

The MCD (LMD / Open University / IAA / ESA / CNES) is general-circulation-model
output validated against spacecraft observations. Everything from this module is
therefore labelled `modeled`, never `measured`.

One request with both solar longitude (Ls) and local time left free returns, for
up to four variables, a table of 25 Ls values (every 15 deg) x 25 local times
(every Martian hour) for the climatological dust scenario: the full seasonal and
diurnal cycle at a point.
"""
from __future__ import annotations

import re

import numpy as np

from ..provenance import Measurement, Missing
from .http import SourceError, fetch

CGI = "https://www-mars.lmd.jussieu.fr/mcd_python/cgi-bin/mcdcgi.py"
ROOT = "https://www-mars.lmd.jussieu.fr/mcd_python/"
REQUESTS = [
    ("tsurf", "ps", "wind", "rho"),
    ("fluxsurf_dn_sw", "tauref", "col_h2ovapor", "none"),
]
TITLES = {
    "tsurf": "Surface temperature", "ps": "Surface pressure", "wind": "Horizontal wind speed",
    "rho": "Density", "fluxsurf_dn_sw": "Incident solar flux on horizontal surface",
    "tauref": "Daily mean dust column visible optical depth", "col_h2ovapor": "Water vapor column",
}
ALTITUDE_M = 10.0      # height above the surface for wind and density, matching Earth's 10 m wind


def _query(lat: float, lon: float, variables: tuple[str, ...]) -> dict:
    v = list(variables) + ["none"] * (4 - len(variables))
    return {
        "datekeyhtml": 1, "ls": "all", "localtime": "all", "year": 2020, "month": 2, "day": 1,
        "hours": 12, "minutes": 0, "seconds": 0, "julian": 2458881.0, "martianyear": 35, "sol": 186,
        "latitude": round(float(lat), 4), "longitude": round(float(lon), 4), "altitude": ALTITUDE_M,
        "zkey": 3, "spacecraft": "none", "isfixedlt": "off", "dust": 1, "hrkey": 1, "averaging": "off",
        "dpi": 80, "islog": "off", "colorm": "jet", "minval": "", "maxval": "", "proj": "cyl",
        "palt": "", "plon": "", "plat": "", "trans": "", "iswind": "off", "latpoint": "", "lonpoint": "",
        "var1": v[0], "var2": v[1], "var3": v[2], "var4": v[3],
    }


def parse_tables(text: str) -> tuple[dict[str, np.ndarray], np.ndarray, np.ndarray, str]:
    """Split the MCD ASCII output into {column title: array[Ls, local time]}."""
    version = (re.search(r"### (MCD_v[\d.]+)", text) or [None, "MCD"])[1]
    tables: dict[str, np.ndarray] = {}
    ls_axis = lt_axis = None
    for block in re.split(r"(?m)^#{20,}\s*\n(?=### MCD)", text):
        title = re.search(r"### Columns 2\+ are (.+)", block)
        if not title:
            continue
        lt, rows, ls = None, [], []
        for line in block.splitlines():
            if "||" not in line:
                continue
            head, body = line.split("||", 1)
            vals = [float(x) for x in body.split()]
            if head.strip().startswith("----"):
                lt = np.array(vals)
            else:
                ls.append(float(head))
                rows.append(vals)
        if lt is None or not rows:
            continue
        tables[title.group(1).strip()] = np.array(rows)
        ls_axis, lt_axis = np.array(ls), lt
    if not tables:
        raise SourceError("MCD: no data tables in response")
    return tables, ls_axis, lt_axis, version


def fetch_point(lat: float, lon: float) -> tuple[dict[str, np.ndarray], np.ndarray, np.ndarray, dict]:
    out: dict[str, np.ndarray] = {}
    meta: dict = {}
    for variables in REQUESTS:
        html, m = fetch(CGI, source="mcd", params=_query(lat, lon, variables),
                        headers={"Referer": ROOT}, timeout=300)
        link = re.search(r"href='\.\./(txt/[0-9a-f]+\.txt)'", html.decode("latin-1"))
        if not link:
            raise SourceError("MCD: response has no data file link")
        text, m2 = fetch(ROOT + link.group(1), source="mcd", timeout=120)
        tables, ls, lt, version = parse_tables(text.decode("latin-1"))
        # Guard against the interface silently answering a different query.
        where = re.search(r"Latitude\s+(-?[\d.]+)N\. Longitude\s+(-?[\d.]+)E", text.decode("latin-1"))
        if not where or abs(float(where.group(1)) - lat) > 0.01 or abs((float(where.group(2)) - lon + 180) % 360 - 180) > 0.01:
            raise SourceError("MCD: response does not match the requested coordinates")
        for var in variables:
            if var == "none":
                continue
            match = [k for k in tables if k.startswith(TITLES[var])]
            if not match:
                raise SourceError(f"MCD: variable '{var}' missing in response")
            out[var] = tables[match[0]]
        meta = {"url": m["url"], "retrieved_at": m2["retrieved_at"], "version": version}
    return out, ls, lt, meta


def summarize(t: dict[str, np.ndarray], ls: np.ndarray, lt: np.ndarray) -> dict[str, float]:
    """Annual statistics. Ls 0 and 360 (and local time 0 and 24) are the same instant: drop the repeat."""
    sl = (slice(0, -1) if ls[-1] - ls[0] >= 360 else slice(None),
          slice(0, -1) if lt[-1] - lt[0] >= 24 else slice(None))
    v = {k: a[sl] for k, a in t.items()}
    ts = v["tsurf"]
    daily_min, daily_max = ts.min(axis=1), ts.max(axis=1)
    wind, rho = v["wind"], v["rho"]
    # Note: sampling is uniform in Ls, not in time (Mars' orbit is eccentric), so
    # "annual mean" here is the mean over solar longitude.
    return {
        "tsurf_mean_K": float(ts.mean()),
        "tsurf_min_K": float(ts.min()),
        "tsurf_max_K": float(ts.max()),
        "diurnal_range_K": float((daily_max - daily_min).mean()),
        "pressure_Pa": float(v["ps"].mean()),
        "wind_speed_ms": float(wind.mean()),
        "wind_dynamic_pressure_Pa": float(0.5 * rho.mean() * wind.mean() ** 2),
        "insolation_Wm2": float(v["fluxsurf_dn_sw"].mean()),
        "dust_optical_depth": float(v["tauref"].mean()),
        "column_water_vapor_kgm2": float(v["col_h2ovapor"].mean()),
        "thermal_cycling_273K": float(((daily_min < 273.15) & (daily_max > 273.15)).mean()),
        "ctx_air_density_kgm3": float(rho.mean()),
        "ctx_seasonal_range_K": float(ts.mean(axis=1).max() - ts.mean(axis=1).min()),
        "ctx_pressure_seasonal_range_Pa": float(v["ps"].mean(axis=1).max() - v["ps"].mean(axis=1).min()),
    }


UNITS = {
    "tsurf_mean_K": "K", "tsurf_min_K": "K", "tsurf_max_K": "K", "diurnal_range_K": "K",
    "pressure_Pa": "Pa", "wind_speed_ms": "m/s", "wind_dynamic_pressure_Pa": "Pa",
    "insolation_Wm2": "W/m2", "dust_optical_depth": "-", "column_water_vapor_kgm2": "kg/m2",
    "thermal_cycling_273K": "0-1", "ctx_air_density_kgm3": "kg/m3", "ctx_seasonal_range_K": "K",
    "ctx_pressure_seasonal_range_Pa": "Pa",
}


def measurements(entity_id: str, lat: float, lon: float) -> tuple[list[Measurement], list[Missing]]:
    try:
        tables, ls, lt, meta = fetch_point(lat, lon)
        values = summarize(tables, ls, lt)
    except SourceError as exc:
        return [], [Missing(entity_id, p, f"MCD no disponible: {exc}", "mcd") for p in UNITS if not p.startswith("ctx_")]
    note = (f"{meta['version']}, escenario climatológico de polvo, radiación solar media; "
            f"media sobre 24 longitudes solares x 24 horas locales; viento y densidad a {ALTITUDE_M:.0f} m")
    return [
        Measurement(entity_id, name, value, UNITS[name], "modeled", "mcd",
                    url=ROOT, retrieved_at=meta["retrieved_at"], period="año marciano climatológico", note=note)
        for name, value in values.items()
    ], []
