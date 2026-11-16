"""Discovery of analogue candidates that are not in the hand-written catalogue.

A regular global grid of land points is characterised with exactly the same
retrieved variables as the catalogued sites (NASA POWER climate, Copernicus DEM
terrain) and scored against every reference region.

What this can and cannot find: it screens on environment, water and topography
only. No global geological descriptors are retrieved, so every discovered cell
carries "geology not verified" and a low confidence by construction. It answers
"where on Earth are surface conditions closest to this region?", which is a
starting point for a geological assessment, not a finished analogue.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

from . import config, similarity
from .sources import dem, nasa_power
from .sources.http import download_file

LAND_URL = "https://naciscdn.org/naturalearth/110m/physical/ne_110m_land.zip"
NEAR_KNOWN_KM = 300.0


def land_grid(step_deg: float) -> pd.DataFrame:
    """Centres of grid cells that fall on land (Natural Earth 1:110m land polygons)."""
    path, _ = download_file(LAND_URL, source="naturalearth", filename="ne_110m_land.zip")
    land = gpd.read_file(f"zip://{path}").union_all()
    lats = np.arange(-90 + step_deg / 2, 90, step_deg)
    lons = np.arange(-180 + step_deg / 2, 180, step_deg)
    rows = [{"id": f"cell_{la:+06.2f}_{lo:+07.2f}", "lat": float(la), "lon": float(lo)}
            for la in lats for lo in lons if land.contains(Point(lo, la))]
    return pd.DataFrame(rows)


def haversine_km(lat1, lon1, lat2, lon2) -> np.ndarray:
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def surface_hint(row: pd.Series) -> str:
    """Coarse reading of the retrieved climate, to flag cells that are obviously not bare ground."""
    if row.get("albedo", 0) > 0.5 and row.get("tsurf_mean_K", 300) < 273.15:
        return "nieve o hielo permanente"
    if row.get("precip_mm_yr", 0) > 800:
        return "clima húmedo (probable cobertura vegetal)"
    if row.get("precip_mm_yr", 1e9) < 100:
        return "hiperárido / árido"
    if row.get("precip_mm_yr", 1e9) < 300:
        return "semiárido"
    return "sin clasificar"


def run(tables: dict, step_deg: float = 5.0, top_n: int = 3, workers: int = 3,
        objective_id: str = "balanced", progress=print) -> tuple[pd.DataFrame, pd.DataFrame]:
    ent = tables["entities"]
    regions = ent[ent["body"] != "earth"]
    known = ent[ent["body"] == "earth"]
    feats, kinds = tables["features"], tables["kinds"]

    grid = land_grid(step_deg)
    progress(f"  grilla de {step_deg}°: {len(grid)} celdas en tierra firme; consultando NASA POWER...")

    def climate(row):
        ms, _ = nasa_power.measurements(row.id, row.lat, row.lon)
        return row.id, ms

    cell_values: dict[str, dict] = {}
    cell_kinds: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, (cid, ms) in enumerate(pool.map(climate, grid.itertuples(index=False))):
            cell_values[cid] = {m.parameter: m.value for m in ms}
            cell_kinds[cid] = {m.parameter: m.kind for m in ms}
            if (i + 1) % 100 == 0:
                progress(f"    {i + 1}/{len(grid)}")
    # A busy API refuses some requests. Ask again, one at a time, for the cells that came back
    # empty, and say how many are still missing: a cell without climate is left out of the scan.
    by_id = grid.set_index("id")
    failed = [cid for cid, v in cell_values.items() if "tsurf_mean_K" not in v]
    for attempt in range(2):
        if not failed:
            break
        progress(f"  {len(failed)} celdas sin respuesta de NASA POWER; reintentando una a una...")
        time.sleep(20)
        for cid in list(failed):
            ms, _ = nasa_power.measurements(cid, float(by_id.loc[cid, "lat"]), float(by_id.loc[cid, "lon"]))
            if ms:
                cell_values[cid] = {m.parameter: m.value for m in ms}
                cell_kinds[cid] = {m.parameter: m.kind for m in ms}
                failed.remove(cid)
    if failed:
        progress(f"  AVISO: {len(failed)} de {len(grid)} celdas quedaron sin datos de NASA POWER y no se evaluaron")
    cells = by_id.join(pd.DataFrame.from_dict(cell_values, orient="index"))
    cells = cells[cells["tsurf_mean_K"].notna()]

    # Stage 1: screen on climate alone, keep the best cells for each region.
    shortlist: set[str] = set()
    for rid in regions["id"]:
        body = regions.set_index("id").loc[rid, "body"]
        s = {cid: similarity.score_pair(cells.loc[cid], feats.loc[rid], body, objective_id)["score"] for cid in cells.index}
        shortlist |= set(pd.Series(s).nlargest(top_n * 3).index)
    # Terrain is also retrieved for every cell that can be bare ground (not an ice sheet,
    # not a humid climate), so that any of them can be compared with a mission region.
    hints = cells.apply(surface_hint, axis=1)
    bare = set(cells.index[~hints.isin(["nieve o hielo permanente", "clima húmedo (probable cobertura vegetal)"])])
    climate_shortlist = set(shortlist)
    shortlist |= bare
    progress(f"  {len(climate_shortlist)} celdas preseleccionadas por clima + {len(shortlist) - len(climate_shortlist)} "
             "de suelo posiblemente desnudo; calculando topografía (Copernicus DEM)...")

    # Stage 2: add terrain for the shortlist and score with everything available.
    def terrain(cid):
        lat, lon = float(cells.loc[cid, "lat"]), float(cells.loc[cid, "lon"])
        ms, _ = dem.measurements(cid, "earth", lat, lon)
        # Same elevation correction as for catalogued sites (the climate payload is cached).
        elev = next((q.value for q in ms if q.parameter == "ctx_elevation_mean_m"), None)
        ms += nasa_power.measurements(cid, lat, lon, site_elevation_m=elev)[0]
        return cid, ms

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for cid, ms in pool.map(terrain, sorted(shortlist)):
            for m in ms:
                cells.loc[cid, m.parameter] = m.value
                cell_kinds[cid][m.parameter] = m.kind
    kinds_df = pd.DataFrame.from_dict(cell_kinds, orient="index")

    cells["surface_hint"] = cells.apply(surface_hint, axis=1)
    dist = np.array([[haversine_km(c.lat, c.lon, k.lat, k.lon) for k in known.itertuples()] for c in cells.itertuples()])
    cells["nearest_catalog_site"] = known["id"].to_numpy()[dist.argmin(axis=1)]
    cells["nearest_catalog_km"] = dist.min(axis=1).round(0)
    cells["near_known"] = cells["nearest_catalog_km"] < NEAR_KNOWN_KM
    cells["shortlisted"] = cells.index.isin(shortlist)

    rows = []
    for rid in regions["id"]:
        body = regions.set_index("id").loc[rid, "body"]
        for cid in shortlist:
            r = similarity.score_pair(cells.loc[cid], feats.loc[rid], body, objective_id, None,
                                      kinds_df.loc[cid], kinds.loc[rid])
            rows.append({"region_id": rid, "body": body, "cell_id": cid, "lat": cells.loc[cid, "lat"],
                         "lon": cells.loc[cid, "lon"], "score": r["score"],
                         "score_topography": r["category_scores"].get("topography"),
                         "score_environment": r["category_scores"].get("environment"),
                         "score_water": r["category_scores"].get("water"),
                         "coverage": r["coverage"], "confidence": r["confidence"],
                         "confidence_label": r["confidence_label"],
                         "surface_hint": cells.loc[cid, "surface_hint"],
                         "nearest_catalog_site": cells.loc[cid, "nearest_catalog_site"],
                         "nearest_catalog_km": cells.loc[cid, "nearest_catalog_km"],
                         "geology": "no verificada"})
    rankings = pd.DataFrame(rows).sort_values(["region_id", "score"], ascending=[True, False])
    rankings = rankings.groupby("region_id").head(top_n * 3).reset_index(drop=True)
    return cells.reset_index(names="id"), rankings
