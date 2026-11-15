"""Land fraction of a grid cell, from Natural Earth 1:50m land polygons.

CERES surface albedo comes on a 1 x 1 degree grid. For islands and coasts that
cell is mostly ocean, and its albedo describes sea water, not the site. The land
fraction lets the pipeline withhold such values instead of reporting them.
"""
from __future__ import annotations

import math
from functools import lru_cache

import geopandas as gpd
from shapely.geometry import box
from shapely.strtree import STRtree

from .http import download_file

URL = "https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip"


@lru_cache(maxsize=1)
def _land():
    path, _ = download_file(URL, source="naturalearth", filename="ne_50m_land.zip")
    geoms = list(gpd.read_file(f"zip://{path}").geometry.explode(index_parts=False))
    return geoms, STRtree(geoms)


def land_fraction_1deg(lat: float, lon: float) -> float:
    """Share of land in the 1-degree cell (integer-degree edges) that contains the point."""
    geoms, tree = _land()
    la, lo = math.floor(lat), math.floor(lon)
    cell = box(lo, la, lo + 1, la + 1)
    area = sum(geoms[i].intersection(cell).area for i in tree.query(cell))
    return float(min(1.0, area / cell.area))
