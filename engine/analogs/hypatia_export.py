"""Export of the engine's results for the Hypatia web app.

Writes one JSON file (public/engine/discovery.json) that the app's discovery provider
reads at run time. Everything in it comes from the processed tables and from the
cached NASA responses; nothing is typed in by hand except the thresholds below.

Three things are exported:

    cells         grid cells of Earth's land that are NOT near a known analog, with the
                  Hypatia qualities the retrieved data support. These become the amber
                  "Hypatia candidate" pins: new places.
    regions       the lunar and Martian mission regions, each with the grid cells whose
                  measured environment and terrain are closest to it.
    siteFindings  the sites already in Hypatia's catalogue, measured with the same
                  data: qualities the data confirm, and qualities the data support but
                  the catalogue does not list (a new use for a known place).

What the engine can and cannot say: it retrieves climate (NASA POWER: MERRA-2
reanalysis and CERES satellite products) and terrain (Copernicus DEM). It retrieves no
global geology, so it never claims a rock type, a mineral or a landform. Qualities are
assigned with the fixed thresholds in RULES, which are exported with the data so the
app can show them.
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point
from shapely.strtree import STRtree

from . import __version__, config, i18n, proposals, similarity
from .discovery import haversine_km
from .provenance import utc_now
from .sources import dem, landmask, nasa_power
from .sources.http import download_file

HYPATIA_ROOT = config.ROOT.parent
DEFAULT_OUT = HYPATIA_ROOT / "public" / "engine" / "discovery.json"
ADMIN1_URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip"

NEAR_KNOWN_KM = 300.0        # a grid cell this close to a known analog is not a new place
RECENT_MONTHS = 36           # the newest published months, compared with the months before them
EARLIER_MONTHS = 84
TOP_PER_REGION = 30
MIN_LAND_FRACTION = 0.5      # below this the climate cell describes the sea, not the site

STRENGTHS = ("partial", "moderate", "strong")
RANK = {None: 0, "partial": 1, "moderate": 2, "strong": 3}

# Fixed thresholds that turn a retrieved value into a Hypatia quality. `below` means a
# smaller value is a closer match. `fail` is the value beyond which the engine reports
# the quality as a limitation. `cap` limits the strength of qualities that are inferred
# rather than measured.
RULES: dict[str, dict] = {
    "hyperarid": {
        "variable": "precip_mm_yr", "unit": "mm/yr", "below": True,
        "strong": 25.0, "moderate": 50.0, "partial": 100.0, "fail": 250.0, "basis": "reanalysis",
    },
    "extreme_cold": {
        "variable": "tsurf_mean_K", "unit": "°C", "below": True,
        "strong": 243.15, "moderate": 258.15, "partial": 268.15, "fail": 278.15, "basis": "reanalysis",
    },
    "permafrost_ground_ice": {
        "variable": "tsurf_mean_K", "unit": "°C", "below": True,
        "moderate": 265.15, "partial": 271.15, "fail": 278.15, "basis": "inferred", "cap": "moderate",
    },
    "high_altitude_low_pressure": {
        "variable": "pressure_Pa", "unit": "kPa", "below": True,
        "strong": 60_000.0, "moderate": 70_000.0, "partial": 80_000.0, "fail": 95_000.0, "basis": "reanalysis",
    },
    "high_uv": {
        "variable": "ctx_uv_index", "unit": "UV index", "below": False,
        "strong": 2.5, "moderate": 2.3, "partial": 2.1, "fail": 1.0, "basis": "measured",
    },
}
# Terrain similarity (0-1, topography category of the engine's score) needed to say a
# place supports traverse rehearsal for a given mission region. Slopes and relief are
# measured at a 463 m baseline, which says nothing about rocks or soil at rover scale,
# so the claim is never "strong", and it is only made where the climate is dry enough
# (under BARE_GROUND_MAX_PRECIP mm/yr) for sparse vegetation to be likely.
TERRAIN_RULE = {"moderate": 0.85, "partial": 0.65}
BARE_GROUND_MAX_PRECIP = 300.0
MEASURABLE = {"mars": [*RULES, "rover_eva_traversal"], "moon": ["rover_eva_traversal"]}

PROGRAM = {
    "shackleton_south_pole": "Artemis",
    "apollo11_tranquillitatis": "Apollo", "apollo15_hadley": "Apollo",
    "apollo16_descartes": "Apollo", "apollo17_taurus_littrow": "Apollo",
    "marius_hills": "Lunar science targets", "aristarchus_plateau": "Lunar science targets",
    "von_karman_spa": "Chang'E-4 (CNSA)",
    "gale_crater": "Mars Science Laboratory", "jezero_crater": "Mars 2020",
    "meridiani_planum": "Mars Exploration Rovers", "gusev_crater": "Mars Exploration Rovers",
    "elysium_insight": "InSight", "phoenix_vastitas": "Phoenix", "ares_vallis": "Mars Pathfinder",
    "oxia_planum": "ExoMars (ESA)",
    "arsia_mons": "Mars science targets", "melas_chasma": "Mars science targets",
    "olympia_undae": "Mars science targets",
}

DATASETS = {
    "earth": ["NASA POWER (MERRA-2 reanalysis)", "NASA POWER (CERES SYN1deg)", "Copernicus DEM GLO-90"],
    "moon": ["LRO LOLA LDEM_64", "LRO Diviner GCP"],
    "mars": ["MGS MOLA MEGDR", "Mars Climate Database v6.2", "MGS TES albedo and thermal inertia"],
}


# ---------------------------------------------------------------- small helpers
def _num(x, digits: int = 2):
    """JSON-safe rounded number (None for missing)."""
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return round(x, digits) if np.isfinite(x) else None


def _display(variable: str, value: float) -> float:
    """Value in the unit shown to the user."""
    if variable.endswith("_K") and variable.startswith("tsurf"):
        return value - 273.15
    if variable == "pressure_Pa":
        return value / 1000.0
    return value


def strength_of(quality: str, value) -> str | None:
    rule = RULES[quality]
    if value is None or not np.isfinite(value):
        return None
    for s in reversed(STRENGTHS):
        if s not in rule:
            continue
        if (value <= rule[s]) if rule["below"] else (value >= rule[s]):
            return s
    return None


def fails(quality: str, value) -> bool:
    rule = RULES[quality]
    if value is None or not np.isfinite(value):
        return False
    return (value > rule["fail"]) if rule["below"] else (value < rule["fail"])


def terrain_strength(topo) -> str | None:
    if topo is None or not np.isfinite(topo):
        return None
    for s in reversed(STRENGTHS):
        if s in TERRAIN_RULE and topo >= TERRAIN_RULE[s]:
            return s
    return None


def surface_code(v: dict) -> str:
    """Coarse reading of the retrieved climate (same rule as discovery.surface_hint)."""
    albedo, t, p = v.get("albedo"), v.get("tsurf_mean_K"), v.get("precip_mm_yr")
    if albedo is not None and np.isfinite(albedo) and albedo > 0.5 and t is not None and t < 273.15:
        return "ice"
    if p is None or not np.isfinite(p):
        return "other"
    if p > 800:
        return "humid"
    if p < 100:
        return "arid"
    if p < 300:
        return "semiarid"
    return "other"


def explain(quality: str, v: dict, period: str, uv_percentile=None) -> str:
    """One sentence naming the evidence for a quality, with its source and its kind."""
    cell = "0.5°×0.625° grid cell"
    if quality == "hyperarid":
        return (f"Mean precipitation {v['precip_mm_yr']:.0f} mm/yr over {period} "
                f"(NASA POWER, MERRA-2 reanalysis, {cell}). Reanalysis estimate for the cell, not a rain gauge.")
    if quality == "extreme_cold":
        text = f"Mean surface temperature {v['tsurf_mean_K'] - 273.15:.0f} °C over {period}"
        if np.isfinite(v.get("tsurf_min_K", np.nan)):
            text += f", with yearly minima near {v['tsurf_min_K'] - 273.15:.0f} °C"
        return text + f" (NASA POWER, MERRA-2 reanalysis, {cell}). Mars averages about −60 °C."
    if quality == "permafrost_ground_ice":
        text = f"Inferred, not measured: a mean surface temperature of {v['tsurf_mean_K'] - 273.15:.0f} °C"
        if np.isfinite(v.get("ctx_frost_days_per_year", np.nan)):
            text += f" and {v['ctx_frost_days_per_year']:.0f} frost days per year"
        return text + (f" over {period} (NASA POWER, MERRA-2 reanalysis) are consistent with perennially frozen "
                       "ground. No ground-ice observation was retrieved.")
    if quality == "high_altitude_low_pressure":
        text = f"Mean surface pressure {v['pressure_Pa'] / 1000:.0f} kPa over {period}"
        if np.isfinite(v.get("ctx_grid_elevation_m", np.nan)):
            text += f" (grid-cell elevation {v['ctx_grid_elevation_m']:,.0f} m)"
        return text + ", NASA POWER, MERRA-2 reanalysis. Mars averages about 0.6 kPa."
    if quality == "high_uv":
        text = f"All-sky UV index {v['ctx_uv_index']:.1f} (daily mean over {period}; CERES SYN1deg satellite product via NASA POWER)"
        if uv_percentile is not None:
            text += f", higher than {uv_percentile:.0f}% of Earth's land grid cells"
        return text + ". Mars receives far more UV, including UVC."
    raise KeyError(quality)


def fail_text(quality: str, v: dict, period: str) -> str:
    rule = RULES[quality]
    value = _display(rule["variable"], v[rule["variable"]])
    what = {"hyperarid": "mean precipitation", "extreme_cold": "mean surface temperature",
            "permafrost_ground_ice": "mean surface temperature", "high_altitude_low_pressure": "mean surface pressure",
            "high_uv": "all-sky UV index (daily mean)"}[quality]
    digits = 1 if quality == "high_uv" else 0
    return f"Checked and not met: {what} {value:.{digits}f} {rule['unit']} over {period} (NASA POWER)."


def assess(v: dict, period: str, uv_sorted: np.ndarray | None = None,
           recent: dict | None = None, earlier: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Mars qualities supported by the retrieved climate, and those checked and failed."""
    found, failed = [], []
    for q, rule in RULES.items():
        var = rule["variable"]
        value = v.get(var)
        if value is None or not np.isfinite(value):
            continue
        s = strength_of(q, value)
        on_ice = surface_code(v) == "ice"
        if q == "permafrost_ground_ice" and on_ice:
            s = None                      # an ice sheet is ice, not ice-cemented ground
        if q == "hyperarid" and on_ice and s:
            s = "partial"                 # little snowfall, but onto ice: there is no dry ground
        if s:
            pct = None
            if q == "high_uv" and uv_sorted is not None:
                pct = 100.0 * np.searchsorted(uv_sorted, value, side="left") / len(uv_sorted)
            item = {"id": q, "strength": s, "basis": rule["basis"], "text": explain(q, v, period, pct)}
            if q == "hyperarid" and on_ice:
                item["text"] += " It falls as snow on permanent ice, so there is no dry ground: counted as partial at most."
            if recent and earlier and np.isfinite(recent.get(var, np.nan)) and np.isfinite(earlier.get(var, np.nan)):
                sr, se = strength_of(q, recent[var]), strength_of(q, earlier[var])
                item["recent"] = _num(_display(var, recent[var]), 1)
                item["earlier"] = _num(_display(var, earlier[var]), 1)
                item["unit"] = rule["unit"]
                item["trend"] = "stronger" if RANK[sr] > RANK[se] else "weaker" if RANK[sr] < RANK[se] else "same"
            found.append(item)
        elif (recent and np.isfinite(recent.get(var, np.nan)) and strength_of(q, recent[var])
              and surface_code(v) != "ice"):
            # Met only in the newest months. Three years is short, so it is never more than "partial".
            digits = 1 if q == "high_uv" else 0
            found.append({
                "id": q, "strength": "partial", "basis": rule["basis"], "trend": "new",
                "recent": _num(_display(var, recent[var]), 1),
                "earlier": _num(_display(var, earlier[var]), 1) if earlier and np.isfinite(earlier.get(var, np.nan)) else None,
                "unit": rule["unit"],
                "text": (f"Only in the newest data: {_display(var, recent[var]):.{digits}f} {rule['unit']} in the newest "
                         f"{RECENT_MONTHS} months, against {_display(var, value):.{digits}f} {rule['unit']} over {period} "
                         "(NASA POWER), which does not meet the threshold. Three years is a short record: this can be "
                         "natural variability."),
            })
        elif fails(q, value):
            failed.append({"id": q, "text": fail_text(q, v, period)})
    return found, failed


# ---------------------------------------------------------------- data access
def climate_windows(lat: float, lon: float, dz: float = 0.0) -> tuple[dict, dict]:
    """Complete-years summary, and the newest months against the months before them, from
    one (cached) POWER response."""
    payload, _ = nasa_power.fetch_point(lat, lon)
    full = nasa_power.summarize(nasa_power.complete_years(payload), dz)
    factor = 1.0
    if dz:
        raw = nasa_power.summarize(nasa_power.complete_years(payload), 0.0)
        factor = full["pressure_Pa"] / raw["pressure_Pa"]
    windows = nasa_power.rolling_windows(payload, RECENT_MONTHS, EARLIER_MONTHS,
                                         dt_K=-nasa_power.LAPSE_RATE * dz, pressure_factor=factor)
    return full, windows


def _admin1():
    path, _ = download_file(ADMIN1_URL, source="naturalearth", filename="ne_10m_admin_1_states_provinces.zip")
    gdf = gpd.read_file(f"zip://{path}")[["name", "name_en", "admin", "geometry"]]
    gdf = gdf[gdf.geometry.notna()].reset_index(drop=True)
    return gdf, STRtree(list(gdf.geometry))


def place_names(points: list[tuple[str, float, float]]) -> dict[str, dict]:
    """State/province and country of each point, from Natural Earth 1:10m admin-1 polygons."""
    gdf, tree = _admin1()
    out = {}
    for key, lat, lon in points:
        pt = Point(lon, lat)
        hits = [i for i in tree.query(pt) if gdf.geometry[i].contains(pt)]
        i = hits[0] if hits else int(tree.nearest(pt))
        row = gdf.iloc[i]
        name = row["name_en"] if isinstance(row["name_en"], str) and row["name_en"].strip() else row["name"]
        out[key] = {"place": name if isinstance(name, str) else None, "country": row["admin"],
                    "approximate": not hits}
    return out


def fmt_coord(lat: float, lon: float) -> str:
    return f"{abs(lat):.1f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.1f}°{'E' if lon >= 0 else 'W'}"


def known_analogs(hypatia_sites: list[dict]) -> pd.DataFrame:
    """Every analog site the system knows: Hypatia's catalogue plus the engine's own list."""
    rows = [{"name": s["name"], "lat": s["lat"], "lon": s["lon"], "inHypatia": True} for s in hypatia_sites]
    for s in config.sites():
        d = [float(haversine_km(s["lat"], s["lon"], h["lat"], h["lon"])) for h in hypatia_sites]
        if min(d) > 50.0:               # not already represented by a Hypatia site
            rows.append({"name": i18n.tr(s["name"]), "lat": s["lat"], "lon": s["lon"], "inHypatia": False})
    return pd.DataFrame(rows)


def cell_kinds(columns) -> pd.Series:
    kinds = {}
    for c in columns:
        if c in nasa_power.UNITS:
            kinds[c] = nasa_power.kind_of(c)
        elif c in dem.UNITS:
            kinds[c] = "measured"
    return pd.Series(kinds)


TERRAIN_KEYS = ("slope_mean_deg", "slope_p95_deg", "relief_m", "roughness_tri_m")
SHOWN = {  # values shown in the site panel: key -> (label, unit, kind, digits)
    "tsurf_mean_K": ("Mean surface temperature", "°C", "reanalysis", 1),
    "tsurf_min_K": ("Yearly minimum temperature", "°C", "reanalysis", 1),
    "tsurf_max_K": ("Yearly maximum temperature", "°C", "reanalysis", 1),
    "diurnal_range_K": ("Day–night temperature range", "K", "reanalysis", 1),
    "precip_mm_yr": ("Precipitation", "mm/yr", "reanalysis", 0),
    "pressure_Pa": ("Surface pressure", "kPa", "reanalysis", 1),
    "wind_speed_ms": ("Mean wind speed (10 m)", "m/s", "reanalysis", 1),
    "dust_optical_depth": ("Aerosol optical depth (550 nm)", "", "reanalysis", 2),
    "ctx_uv_index": ("UV index (all-sky daily mean)", "", "measured", 1),
    "albedo": ("Surface albedo", "", "measured", 2),
    "insolation_Wm2": ("Sunlight at the surface", "W/m²", "measured", 0),
    "slope_mean_deg": ("Mean slope (463 m baseline)", "°", "measured", 1),
    "relief_m": ("Relief in a 40 km window (P95–P5)", "m", "measured", 0),
    "ctx_elevation_mean_m": ("Mean elevation", "m", "measured", 0),
}


def value_meta() -> dict:
    """Label, unit, kind and source of each shown value (written once, not per place)."""
    out = {}
    for key, (label, unit, kind, _) in SHOWN.items():
        source = "Copernicus DEM GLO-90" if key in dem.UNITS else ("NASA POWER (CERES)" if kind == "measured" else "NASA POWER (MERRA-2)")
        out[key] = {"label": label, "unit": unit, "kind": kind, "source": source,
                    "elevationCorrected": key in nasa_power.ELEVATION_CORRECTED}
    return out


def shown_values(v: dict) -> dict:
    out = {}
    for key, (_, _, _, digits) in SHOWN.items():
        x = v.get(key)
        if x is None or not np.isfinite(x):
            continue
        if key.startswith("tsurf"):
            x = x - 273.15
        elif key == "pressure_Pa":
            x = x / 1000.0
        out[key] = _num(x, digits)
    return out


# ---------------------------------------------------------------- export
def build(tables: dict, hypatia_dir: Path = HYPATIA_ROOT, progress=print) -> dict:
    i18n.set_lang("en")
    sites_json = json.loads((hypatia_dir / "data" / "sites.json").read_text(encoding="utf-8"))
    hyp_sites = sites_json["sites"]
    known = known_analogs(hyp_sites)

    ent = tables["entities"]
    feats, kinds = tables["features"], tables["kinds"]
    region_rows = ent[ent["body"] != "earth"].set_index("id")
    cells = tables["discovery_cells"].set_index("id")
    env = None
    env_path = config.PROCESSED_DIR / "environment_cells.csv"
    if env_path.exists():
        env = pd.read_csv(env_path).set_index("id")
    start, end = nasa_power.default_period()
    window_info: dict = {}
    uv_sorted = np.sort(cells["ctx_uv_index"].dropna().to_numpy())
    ckinds = cell_kinds(cells.columns)

    # ---- novelty: distance from every cell to the nearest known analog
    dist = np.array([[float(haversine_km(c.lat, c.lon, k.lat, k.lon)) for k in known.itertuples()]
                     for c in cells.itertuples()])
    cells["known_km"] = dist.min(axis=1)
    cells["known_name"] = known["name"].to_numpy()[dist.argmin(axis=1)]
    cells["known_in_hypatia"] = known["inHypatia"].to_numpy()[dist.argmin(axis=1)]
    new_cells = cells[cells["known_km"] >= NEAR_KNOWN_KM]
    has_terrain = new_cells[new_cells["slope_mean_deg"].notna()]
    progress(f"  {len(cells)} land cells; {len(cells) - len(new_cells)} within {NEAR_KNOWN_KM:.0f} km of a known analog; "
             f"{len(has_terrain)} new cells with terrain")

    # ---- mission regions and the grid cells closest to each
    regions_out, best_terrain = [], {}
    in_top: set[str] = set()
    for r in config.regions():
        rid, body = r["id"], r["body"]
        target = feats.loc[rid]
        rows = []
        for cid, c in has_terrain.iterrows():
            res = similarity.score_pair(c, target, body, "balanced", None, ckinds, kinds.loc[rid])
            topo = res["category_scores"].get("topography")
            rows.append({"cell": cid, "score": res["score"], "topo": topo,
                         "env": res["category_scores"].get("environment"),
                         "water": res["category_scores"].get("water"), "confidence": res["confidence"]})
            key = (cid, body)
            if topo is not None and np.isfinite(topo) and topo > best_terrain.get(key, ("", -1.0))[1]:
                best_terrain[key] = (rid, float(topo))
        top = sorted((x for x in rows if np.isfinite(x["score"])), key=lambda x: -x["score"])[:TOP_PER_REGION]
        in_top |= {x["cell"] for x in top}
        regions_out.append({
            "id": rid, "target": body, "name": i18n.tr(r["name"]), "program": PROGRAM.get(rid, "Other"),
            "summary": i18n.tr(r["summary"]),
            "lat": _num(region_rows.loc[rid, "lat"], 3), "lon": _num(region_rows.loc[rid, "lon"], 3),
            "tsurfMeanC": _num(target.get("tsurf_mean_K", np.nan) - 273.15, 0),
            "pressurePa": _num(target.get("pressure_Pa"), 0),
            "slopeMeanDeg": _num(target.get("slope_mean_deg"), 1), "reliefM": _num(target.get("relief_m"), 0),
            "top": [{"cell": x["cell"], "score": _num(x["score"], 3), "topo": _num(x["topo"], 3),
                     "env": _num(x["env"], 3), "water": _num(x["water"], 3),
                     "confidence": _num(x["confidence"], 3)} for x in top],
        })
    progress(f"  {len(regions_out)} mission regions scored against the grid")

    # ---- cells: qualities from the full period, with the newest years compared to the earlier ones
    cells_out, period = {}, f"{start}–{end}"
    names = place_names([(cid, c.lat, c.lon) for cid, c in new_cells.iterrows()])
    for cid, c in new_cells.iterrows():
        v = {k: (float(c[k]) if pd.notna(c[k]) else np.nan) for k in c.index if isinstance(c[k], (int, float, np.floating))}
        try:
            _, w = climate_windows(c.lat, c.lon)
        except Exception:
            w = {}
        if w and not window_info:
            window_info = {"recent": w["recent_label"], "earlier": w["earlier_label"], "through": w["through"],
                           "recentMonths": RECENT_MONTHS, "earlierMonths": EARLIER_MONTHS}
        found, failed = assess(v, period, uv_sorted, w.get("recent"), w.get("earlier"))
        if not found and cid not in in_top:
            continue
        surface = surface_code(v)
        terrain = {}
        for body in config.BODIES:
            if (cid, body) in best_terrain:
                rid, topo = best_terrain[(cid, body)]
                terrain[body] = {"region": rid, "topo": _num(topo, 3)}
        place = names[cid]
        item = {
            "lat": float(c.lat), "lon": float(c.lon), "coord": fmt_coord(c.lat, c.lon),
            "place": place["place"], "country": place["country"],
            "surface": surface,
            "nearest": {"name": c["known_name"], "km": int(round(c["known_km"])), "inHypatia": bool(c["known_in_hypatia"])},
            "values": shown_values(v),
            "qualities": found, "fails": failed, "terrain": terrain,
        }
        if env is not None and cid in env.index:
            item["environment"] = i18n.tr_env(env.loc[cid, "environment"])
            item["rarity"] = _num(env.loc[cid, "rarity"], 2)
        cells_out[cid] = item
    progress(f"  {len(cells_out)} candidate cells exported")

    # ---- sites already in Hypatia's catalogue, measured with the same data
    findings = {}
    for s in hyp_sites:
        findings[s["id"]] = site_finding(s, feats, kinds, uv_sorted, period)
    n_new = sum(1 for f in findings.values() for c in f["checks"] if c["status"] == "new_use")
    progress(f"  {len(findings)} catalogued sites measured; {n_new} uses not listed in the catalogue")

    # ---- places proposed by the team, measured the same way
    proposed = []
    for p in proposals.load():
        entry, finding = proposal_entry(p, feats, kinds, uv_sorted, period)
        proposed.append(entry)
        findings[entry["id"]] = finding
    progress(f"  {len(proposed)} places proposed by the team measured")

    fresh_path = config.PROCESSED_DIR / "freshness.json"
    fresh = json.loads(fresh_path.read_text()) if fresh_path.exists() else {}
    return {
        "schema": 1,
        "generatedAt": utc_now(),
        "engineVersion": __version__,
        "climatePeriod": {"start": start, "end": end},
        "windows": window_info,
        "grid": {"stepDeg": float(abs(cells["lat"].diff().replace(0, np.nan).dropna().abs().min())),
                 "landCells": int(len(cells)), "windowKm": 2 * config.WINDOW_HALF_M / 1000,
                 "baselineM": config.BASELINE_M, "nearKnownKm": NEAR_KNOWN_KM},
        "freshness": {
            "checkedAt": fresh.get("checked_at"),
            "collections": [{"shortName": c.get("short_name"), "title": c.get("title"),
                             "latest": c.get("latest_granule_end") or c.get("latest_granule_start")}
                            for c in fresh.get("earth_collections", [])],
        },
        "datasets": DATASETS,
        "measurable": MEASURABLE,
        "rules": {q: {k: r[k] for k in ("variable", "unit", "below", "strong", "moderate", "partial", "fail", "basis") if k in r}
                  for q, r in RULES.items()},
        "terrainRule": {**TERRAIN_RULE, "bareGroundMaxPrecip": BARE_GROUND_MAX_PRECIP},
        "valueMeta": value_meta(),
        "regions": regions_out,
        "cells": cells_out,
        "proposals": proposed,
        "declined": [{"name": d["name"], "reason": {"en": d["en"], "es": d["es"]}} for d in proposals.declined()],
        "siteFindings": findings,
    }


def site_finding(site: dict, feats: pd.DataFrame, kinds: pd.DataFrame, uv_sorted: np.ndarray, period: str) -> dict:
    """Measure a catalogued site with the engine's data and compare with what the catalogue lists."""
    sid, lat, lon = site["id"], float(site["lat"]), float(site["lon"])
    out: dict = {"values": [], "checks": [], "regions": {}, "notes": []}
    terrain_ms, _ = dem.measurements(sid, "earth", lat, lon)
    tv = {m.parameter: m.value for m in terrain_ms}
    elev = tv.get("ctx_elevation_mean_m")
    try:
        land = landmask.land_fraction_1deg(lat, lon)
    except Exception:
        land = float("nan")

    v: dict = dict(tv)
    recent = earlier = None
    climate_ok = not (np.isfinite(land) and land < MIN_LAND_FRACTION)
    dz = 0.0
    try:
        payload, _ = nasa_power.fetch_point(lat, lon)
        grid_elev = float(payload["geometry"]["coordinates"][2])
        if elev is not None and np.isfinite(elev) and abs(elev - grid_elev) > nasa_power.ELEVATION_TOLERANCE_M:
            dz = float(elev - grid_elev)
        full, w = climate_windows(lat, lon, dz)
        recent, earlier = w.get("recent"), w.get("earlier")
        v.update(full)
        if dz:
            out["notes"].append(f"The reanalysis grid cell is {abs(dz):.0f} m {'below' if dz > 0 else 'above'} the site; "
                                "temperature and pressure were corrected for elevation (derived values).")
    except Exception as exc:  # network failure: report it, do not invent values
        climate_ok = False
        out["notes"].append(f"NASA POWER was not available for this site ({type(exc).__name__}).")
    if np.isfinite(land) and land < MIN_LAND_FRACTION:
        out["notes"].append(f"The climate grid cell is {1 - land:.0%} ocean, so its values describe the sea, not the site. "
                            "No climate quality was assessed.")
        v = dict(tv)
    if np.isfinite(land) and land < nasa_power.MIN_LAND_FRACTION:
        v.pop("albedo", None)
    if not tv:
        out["notes"].append("No valid land elevation in the 40 km window (sea or no data): terrain was not assessed.")
    out["values"] = shown_values(v)
    out["elevationCorrected"] = bool(dz)

    series = pd.Series(v, dtype=float)
    skinds = cell_kinds(series.index)
    surface = surface_code(v) if climate_ok else "other"
    found, failed = assess(v, period, uv_sorted, recent, earlier) if climate_ok else ([], [])
    found_by_id = {f["id"]: f for f in found}
    failed_by_id = {f["id"]: f for f in failed}

    for target in site["targets"]:
        listed = {x["qualityId"] for x in site["similarities"] if x["target"] == target}
        limited = {x.get("qualityId") for x in site["limitations"] if x["target"] == target and x.get("qualityId")}
        # mission regions closest to the site (environment, water and terrain; no geology)
        scored = []
        for r in config.regions():
            if r["body"] != target:
                continue
            res = similarity.score_pair(series, feats.loc[r["id"]], target, "balanced", None, skinds, kinds.loc[r["id"]])
            if np.isfinite(res["score"]):
                scored.append({"id": r["id"], "score": _num(res["score"], 3),
                               "topo": _num(res["category_scores"].get("topography"), 3),
                               "confidence": _num(res["confidence"], 3)})
        scored.sort(key=lambda x: -x["score"])
        # Without climate the comparison would rest on terrain alone, so it is not reported.
        out["regions"][target] = scored[:3] if climate_ok else []

        if target == "mars":
            for q in RULES:
                if q in found_by_id:
                    f = found_by_id[q]
                    if q in listed:
                        out["checks"].append({**f, "qualityId": q, "target": target, "status": "confirmed"})
                    elif q not in limited:
                        out["checks"].append({**f, "qualityId": q, "target": target, "status": "new_use"})
                elif q in failed_by_id and q in listed:
                    out["checks"].append({
                        "qualityId": q, "target": target, "status": "not_supported",
                        "text": failed_by_id[q]["text"].replace("Checked and not met: ", "The grid cell gives ")
                        + " The cell is about 50 km wide, so the site itself can differ.",
                    })
        # terrain: the mission region whose slopes and relief this site matches best
        with_topo = [x for x in scored if x["topo"] is not None]
        if with_topo and surface in ("arid", "semiarid"):
            best = max(with_topo, key=lambda x: x["topo"])
            s = terrain_strength(best["topo"])
            if s and "rover_eva_traversal" in listed:
                out["checks"].append({"qualityId": "rover_eva_traversal", "target": target, "status": "confirmed",
                                      "strength": s, "basis": "inferred", "region": best["id"], "topo": best["topo"]})
            elif s and RANK[s] >= RANK["moderate"] and "rover_eva_traversal" not in limited:
                out["checks"].append({"qualityId": "rover_eva_traversal", "target": target, "status": "new_use",
                                      "strength": s, "basis": "inferred", "region": best["id"], "topo": best["topo"]})
    for c in out["checks"]:
        c.pop("id", None)
    return out


def proposal_entry(p: dict, feats: pd.DataFrame, kinds: pd.DataFrame, uv_sorted: np.ndarray, period: str) -> tuple[dict, dict]:
    """A team proposal for the app: what the team and the literature say, plus what the engine
    measured there (qualities the data support or rule out, closest mission regions, values)."""
    m = proposals.measure(p)
    v = m["values"]
    series, skinds = proposals.frame(m)
    recent = earlier = None
    if m["climate_ok"]:
        try:
            _, w = climate_windows(float(p["lat"]), float(p["lon"]), m["dz"])
            recent, earlier = w.get("recent"), w.get("earlier")
        except Exception:
            pass
    found, failed = assess(v, period, uv_sorted, recent, earlier) if m["climate_ok"] else ([], [])
    for f in failed:
        if f["id"] == "hyperarid":      # the team may know the place to be drier than its grid cell
            f["text"] += (" This is the value of a reanalysis grid cell about 50 km wide; in mountains it can be "
                          "far from the place's own rainfall.")
    surface = surface_code(v) if m["climate_ok"] else "other"
    regions, terrain = {}, {}
    for target in p["targets"]:
        scored = []
        for r in config.regions():
            if r["body"] != target:
                continue
            res = similarity.score_pair(series, feats.loc[r["id"]], target, "balanced", None, skinds, kinds.loc[r["id"]])
            if np.isfinite(res["score"]):
                scored.append({"id": r["id"], "score": _num(res["score"], 3),
                               "topo": _num(res["category_scores"].get("topography"), 3),
                               "confidence": _num(res["confidence"], 3)})
        scored.sort(key=lambda x: -x["score"])
        regions[target] = scored[:3] if m["climate_ok"] else []
        with_topo = [x for x in scored if x["topo"] is not None]
        if with_topo and surface in ("arid", "semiarid"):
            best = max(with_topo, key=lambda x: x["topo"])
            if terrain_strength(best["topo"]):
                terrain[target] = {"region": best["id"], "topo": best["topo"]}
    entry = {
        "id": f"team:{p['id']}", "name": p["name"], "country": p["country"],
        "lat": float(p["lat"]), "lon": float(p["lon"]), "targets": p["targets"], "status": p["status"],
        "rationale": p["rationale"], "note": p.get("note"),
        "proposed": [{"qualityId": q["quality"], "targets": q["targets"], "strength": q["strength"],
                      "evidence": q["evidence"], "text": {"en": q["en"], "es": q["es"]}} for q in p.get("proposed", [])],
        "references": p.get("refs", []),
        "surface": surface, "values": shown_values(v),
        "qualities": found if "mars" in p["targets"] else [], "fails": failed if "mars" in p["targets"] else [],
        "terrain": terrain,
    }
    finding = {"values": shown_values(v), "elevationCorrected": bool(m["dz"]), "checks": [], "regions": regions, "notes": m["notes"]}
    return entry, finding


def write(tables: dict, out_path: Path = DEFAULT_OUT, hypatia_dir: Path = HYPATIA_ROOT, progress=print) -> Path:
    data = build(tables, hypatia_dir, progress)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return out_path
