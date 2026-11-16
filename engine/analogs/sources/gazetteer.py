"""IAU / USGS Gazetteer of Planetary Nomenclature.

Used for two things: (1) coordinates of reference regions that are not landing
sites are looked up by feature name instead of being typed by hand, and
(2) landing-site coordinates are checked against the bounding box of the named
feature that hosts them.
"""
from __future__ import annotations

from functools import lru_cache

import geopandas as gpd

from .http import SourceError, download_file

URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/{body}_nomenclature_center_pts.zip"


@lru_cache(maxsize=None)
def table(body: str) -> gpd.GeoDataFrame:
    path, _ = download_file(URL.format(body=body.upper()), source="gazetteer",
                            filename=f"{body}_nomenclature_center_pts.zip")
    return gpd.read_file(f"zip://{path}")


def lookup(body: str, name: str) -> dict:
    """Approved IAU feature by exact name (accents optional). Longitude is 0-360 E, planetocentric."""
    g = table(body)
    key = name.strip().lower()
    hit = g[(g["name"].str.lower() == key) | (g["clean_name"].str.lower() == key)]
    hit = hit[hit["approval"].str.contains("Adopted", na=False)]
    if len(hit) == 0:
        raise SourceError(f"IAU gazetteer: feature '{name}' not found on {body}")
    row = hit.iloc[0]
    return {
        "name": row["name"], "lat": float(row["center_lat"]), "lon": float(row["center_lon"]) % 360.0,
        "diameter_km": float(row["diameter"]), "type": row["type"], "link": row["link"],
        "min_lat": float(row["min_lat"]), "max_lat": float(row["max_lat"]),
        "min_lon": float(row["min_lon"]), "max_lon": float(row["max_lon"]),
    }


def contains(feature: dict, lat: float, lon: float, margin_deg: float = 0.5) -> bool:
    """True if the point lies inside the feature's bounding box (with a small margin)."""
    if not (feature["min_lat"] - margin_deg <= lat <= feature["max_lat"] + margin_deg):
        return False
    lo, hi = feature["min_lon"] - margin_deg, feature["max_lon"] + margin_deg
    lon = lon % 360.0
    return any(lo <= x <= hi for x in (lon - 360.0, lon, lon + 360.0))
