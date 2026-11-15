"""Satellite imagery from NASA Worldview's services.

Worldview (https://worldview.earthdata.nasa.gov) displays layers served by GIBS, the
Global Imagery Browse Services. This module requests the same layers: whole-Earth
mosaics used as the texture of the 3-D globe, and a snapshot image of each site
(Worldview Snapshots service).
"""
from __future__ import annotations

import io
import math
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .. import config
from .http import SourceError, session

GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
SNAPSHOTS = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
TEXTURE_DIR = config.ROOT / "app" / "globe_component" / "textures"
SNAPSHOT_DIR = config.PROCESSED_DIR / "snapshots"

# Layers of the Worldview link given in the challenge: (label, has a daily date).
LAYERS = {
    "BlueMarble_ShadedRelief_Bathymetry": ("Blue Marble · relieve y batimetría", False),
    "BlueMarble_NextGeneration": ("Blue Marble · Next Generation", False),
    "MODIS_Terra_CorrectedReflectance_TrueColor": ("MODIS Terra · color verdadero (diario)", True),
    "MODIS_Aqua_CorrectedReflectance_TrueColor": ("MODIS Aqua · color verdadero (diario)", True),
    "VIIRS_NOAA20_CorrectedReflectance_TrueColor": ("VIIRS NOAA-20 · color verdadero (diario)", True),
    "VIIRS_NOAA21_CorrectedReflectance_TrueColor": ("VIIRS NOAA-21 · color verdadero (diario)", True),
    "OCI_PACE_True_Color": ("PACE OCI · color verdadero (diario)", True),
}
DEFAULT_LAYER = "BlueMarble_ShadedRelief_Bathymetry"
SNAPSHOT_LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor"


def default_day() -> date:
    """Two days back: the most recent day whose global mosaic is reliably complete."""
    return date.today() - timedelta(days=2)


def sunlit_day(lat: float, today: date | None = None) -> date:
    """A recent date on which the site is in daylight (avoids polar-night black images)."""
    today = today or date.today()
    day = today - timedelta(days=2)
    if lat > 55 and (day.month >= 10 or day.month <= 2):
        year = day.year if day.month >= 10 else day.year - 1
        return date(year, 7, 15)
    if lat < -55 and 4 <= day.month <= 8:
        return date(day.year, 1, 15)
    return day


MIN_COVERAGE = 0.3        # share of non-black pixels below which a daily mosaic counts as "no data yet"


def _wms_params(layer: str, day: date | None, width: int) -> dict:
    params = {"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0", "LAYERS": layer, "CRS": "EPSG:4326",
              "BBOX": "-90,-180,90,180", "WIDTH": width, "HEIGHT": width // 2, "FORMAT": "image/jpeg"}
    if day is not None:
        params["TIME"] = f"{day:%Y-%m-%d}"
    return params


def _coverage_of(image_bytes: bytes) -> float:
    """Share of the image that is not black (GIBS returns black where a layer has no data)."""
    grey = np.asarray(Image.open(io.BytesIO(image_bytes)).convert("L").resize((256, 128)))
    return float((grey > 8).mean())


@lru_cache(maxsize=256)
def coverage(layer: str, day: date) -> float:
    """How much of the globe a daily layer covers on a date, from a small probe image."""
    try:
        resp = session().get(GIBS_WMS, params=_wms_params(layer, day, 512), timeout=60)
        if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
            return 0.0
        return _coverage_of(resp.content)
    except Exception:
        return 0.0


def resolve_day(layer: str, day: date | None = None, max_back: int = 14) -> date | None:
    """The requested date if the layer has imagery for it, otherwise the most recent earlier date that does.

    Some instruments publish with a delay of several days (PACE OCI, for example), so the
    newest dates return an empty mosaic. Returns None if nothing is found within `max_back` days.
    """
    if not LAYERS[layer][1]:
        return day
    day = day or default_day()
    for back in range(max_back + 1):
        candidate = day - timedelta(days=back)
        if coverage(layer, candidate) >= MIN_COVERAGE:
            return candidate
    return None


def global_texture(layer: str = DEFAULT_LAYER, day: date | None = None, width: int = 4096) -> Path:
    """Whole-Earth equirectangular image of a GIBS layer, cached as a JPEG for the globe."""
    if layer not in LAYERS:
        raise SourceError(f"unknown GIBS layer {layer}")
    daily = LAYERS[layer][1]
    day = day or default_day()
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    path = TEXTURE_DIR / (f"earth_{layer}_{day:%Y%m%d}.jpg" if daily else f"earth_{layer}.jpg")
    if path.exists() and path.stat().st_size > 20_000:
        return path
    resp = session().get(GIBS_WMS, params=_wms_params(layer, day if daily else None, width), timeout=180)
    if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
        raise SourceError(f"GIBS did not return an image for {layer}: HTTP {resp.status_code}")
    if daily and _coverage_of(resp.content) < MIN_COVERAGE:
        # An empty mosaic would paint the globe black: do not cache it.
        raise SourceError(f"{layer} has no imagery yet for {day:%Y-%m-%d}")
    path.write_bytes(resp.content)
    return path


def snapshot(site_id: str, lat: float, lon: float, day: date | None = None, half_deg: float = 0.45,
             layer: str = SNAPSHOT_LAYER, size: int = 640) -> dict:
    """Satellite image of the area around a site; returns the file path and the request made."""
    day = day or sunlit_day(lat)
    half_lon = min(20.0, half_deg / max(math.cos(math.radians(lat)), 0.05))
    south, north = max(-90.0, lat - half_deg), min(90.0, lat + half_deg)
    params = {"REQUEST": "GetSnapshot", "TIME": f"{day:%Y-%m-%d}", "CRS": "EPSG:4326",
              "BBOX": f"{south:.4f},{lon - half_lon:.4f},{north:.4f},{lon + half_lon:.4f}",
              "LAYERS": layer, "FORMAT": "image/jpeg", "WIDTH": size, "HEIGHT": size}
    resp = session().get(SNAPSHOTS, params=params, timeout=120)
    if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
        raise SourceError(f"Worldview Snapshots: HTTP {resp.status_code}")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / f"{site_id}.jpg"
    path.write_bytes(resp.content)
    return {"site_id": site_id, "file": path.name, "date": f"{day:%Y-%m-%d}", "layer": layer,
            "request_url": resp.url, "bytes": len(resp.content)}


def worldview_link(lat: float, lon: float, day: date | None = None, half_deg: float = 1.5) -> str:
    """Worldview permalink centred on a site, with the layer set of the challenge link."""
    day = day or default_day()
    half_lon = half_deg * 2
    layers = ("Reference_Labels_15m(hidden),Coastlines_15m,BlueMarble_NextGeneration(hidden),"
              "OCI_PACE_True_Color(hidden),VIIRS_NOAA21_CorrectedReflectance_TrueColor(hidden),"
              "VIIRS_NOAA20_CorrectedReflectance_TrueColor(hidden),MODIS_Aqua_CorrectedReflectance_TrueColor(hidden),"
              "MODIS_Terra_CorrectedReflectance_TrueColor")
    return (f"https://worldview.earthdata.nasa.gov/?v={lon - half_lon:.3f},{lat - half_deg:.3f},"
            f"{lon + half_lon:.3f},{lat + half_deg:.3f}&l={layers}&t={day:%Y-%m-%d}")
