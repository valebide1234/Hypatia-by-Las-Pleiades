"""Places added by the user or by the assistant.

A new place gets exactly the same retrieved variables as a catalogued site (NASA POWER
climate with elevation correction, Copernicus DEM terrain). Its geology is unknown, so
it is scored on environment, water and topography only and its confidence is low.
"""
from __future__ import annotations

import re
import unicodedata

import pandas as pd

from . import config
from .sources import dem, nasa_power
from .sources.http import SourceError, session

NOMINATIM = "https://nominatim.openstreetmap.org/search"
MEAS = config.PROCESSED_DIR / "custom_measurements.csv"
ENTS = config.PROCESSED_DIR / "custom_entities.csv"


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return "custom_" + (re.sub(r"[^a-z0-9]+", "_", s).strip("_")[:40] or "lugar")


def geocode(name: str) -> dict:
    """Coordinates of a named place from OpenStreetMap Nominatim (never guessed)."""
    resp = session().get(NOMINATIM, params={"q": name, "format": "jsonv2", "limit": 1, "accept-language": "es"},
                         timeout=30)
    if resp.status_code != 200:
        raise SourceError(f"geocodificador no disponible (HTTP {resp.status_code})")
    hits = resp.json()
    if not hits:
        raise SourceError(f"no se encontró ningún lugar llamado '{name}'")
    h = hits[0]
    return {"lat": float(h["lat"]), "lon": float(h["lon"]), "display_name": h.get("display_name", name)}


def add_place(name: str, lat: float | None = None, lon: float | None = None) -> dict:
    """Retrieve NASA data for a new place and store it. Returns the new entity row."""
    coord_source = "coordenadas indicadas por el usuario"
    display = name
    if lat is None or lon is None:
        g = geocode(name)
        lat, lon, display = g["lat"], g["lon"], g["display_name"]
        coord_source = "OpenStreetMap Nominatim"
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise SourceError("coordenadas fuera de rango")
    eid = slug(name)

    terrain, _ = dem.measurements(eid, "earth", lat, lon)
    elev = next((m.value for m in terrain if m.parameter == "ctx_elevation_mean_m"), None)
    climate, missing = nasa_power.measurements(eid, lat, lon, site_elevation_m=elev)
    if not climate:
        raise SourceError("NASA POWER no devolvió datos para ese punto: " + (missing[0].reason if missing else ""))
    rows = pd.DataFrame([m.to_dict() for m in terrain + climate])
    entity = {"id": eid, "body": "earth", "name": name, "lat": lat, "lon": lon, "country": display, "region": "",
              "geology_type": "sin verificar", "summary": "Lugar agregado por el usuario; geología no verificada.",
              "coord_source": coord_source, "access_score": None, "access_note": "", "heritage": "", "refs": "",
              "notes": "", "origin": "custom", "nasa_used": False, "nasa_program": "", "used_by": ""}

    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    old_m = pd.read_csv(MEAS) if MEAS.exists() else pd.DataFrame()
    old_e = pd.read_csv(ENTS) if ENTS.exists() else pd.DataFrame()
    if len(old_m):
        old_m = old_m[old_m["entity_id"] != eid]
    if len(old_e):
        old_e = old_e[old_e["id"] != eid]
    pd.concat([old_m, rows], ignore_index=True).to_csv(MEAS, index=False)
    pd.concat([old_e, pd.DataFrame([entity])], ignore_index=True).to_csv(ENTS, index=False)
    return entity


def remove_place(entity_id: str) -> None:
    for path, col in ((MEAS, "entity_id"), (ENTS, "id")):
        if path.exists():
            df = pd.read_csv(path)
            df = df[df[col] != entity_id]
            if len(df):
                df.to_csv(path, index=False)
            else:
                path.unlink()
