"""Places proposed as analogs by the team (data/catalog/team_proposals.yaml), measured with
the same NASA data as every other place.

The engine adds what it can retrieve (climate, terrain, the qualities those support, the
closest mission regions). What the team or the literature claims about a place stays labelled
as such: the engine does not verify geology or biology.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from . import config
from .sources import dem, landmask, nasa_power

MIN_LAND_FRACTION = 0.5


@lru_cache(maxsize=None)
def catalog() -> dict:
    return config.load_yaml(config.CATALOG_DIR / "team_proposals.yaml")


def load() -> list[dict]:
    return catalog()["proposals"]


def declined() -> list[dict]:
    return catalog().get("declined", [])


def measure(place: dict) -> dict:
    """Climate and terrain of a point, as for a catalogued site: values, kinds, sources, notes,
    the elevation correction applied (m) and whether the climate cell is land enough to use."""
    pid, lat, lon = place["id"], float(place["lat"]), float(place["lon"])
    values, kinds, src, notes = {}, {}, {}, []
    terrain, _ = dem.measurements(pid, "earth", lat, lon)
    elev = next((m.value for m in terrain if m.parameter == "ctx_elevation_mean_m"), None)
    try:
        land = landmask.land_fraction_1deg(lat, lon)
    except Exception:
        land = float("nan")
    climate_ok = not (np.isfinite(land) and land < MIN_LAND_FRACTION)
    climate, dz = [], 0.0
    if climate_ok:
        climate, _ = nasa_power.measurements(pid, lat, lon, site_elevation_m=elev)
        dz = next((m.value for m in climate if m.parameter == "ctx_elevation_correction_m"), 0.0)
        if dz:
            notes.append(f"The reanalysis grid cell is {abs(dz):.0f} m {'below' if dz > 0 else 'above'} the place; "
                         "temperature and pressure were corrected for elevation (derived values).")
        if not climate:
            climate_ok = False
            notes.append("NASA POWER returned no data for this point.")
    else:
        notes.append(f"The climate grid cell is {1 - land:.0%} ocean, so its values describe the sea, not the place. "
                     "No climate quality was assessed.")
    if not terrain:
        notes.append("No valid land elevation in the 40 km window (sea or no data): terrain was not assessed.")
    for m in [*terrain, *climate]:
        values[m.parameter], kinds[m.parameter], src[m.parameter] = float(m.value), m.kind, m.source
    return {"values": values, "kinds": kinds, "src": src, "notes": notes, "dz": float(dz), "climate_ok": climate_ok}


def frame(measured: dict) -> tuple[pd.Series, pd.Series]:
    return pd.Series(measured["values"], dtype=float), pd.Series(measured["kinds"])
