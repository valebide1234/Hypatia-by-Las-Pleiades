"""Topography on a common footing for the three bodies.

Slope and roughness depend strongly on the baseline they are measured over, so
comparing a 90 m Earth DEM with a 463 m Mars DEM directly would be meaningless.
Every DEM is therefore warped (GDAL, through rasterio) onto the same local grid:

    projection  azimuthal equidistant centred on the site, on that body's figure
    footprint   2 * WINDOW_HALF_M square (40 x 40 km by default)
    posting     BASELINE_M (463 m, the native MOLA MEGDR resolution)

Sources:
    Earth  Copernicus DEM GLO-90 (cloud-optimised GeoTIFF tiles, AWS Open Data), averaged down
    Moon   LRO LOLA LDEM_64 (64 px/deg = 474 m at the equator), NASA PDS Geosciences
    Mars   MGS MOLA MEGDR mosaic (463 m), USGS Astrogeology
"""
from __future__ import annotations

import math

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.transform import from_origin
from rasterio.warp import reproject

from .. import config
from ..provenance import Measurement, Missing, utc_now

COPERNICUS_URL = (
    "https://copernicus-dem-90m.s3.amazonaws.com/"
    "Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/"
    "Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif"
)
LOLA_URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.lbl"
MOLA_URL = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"

DEM_INFO = {
    "earth": {"source": "copernicus_dem", "url": "https://copernicus-dem-90m.s3.amazonaws.com/",
              "native": "90 m", "datum": "geoide EGM2008"},
    "moon": {"source": "lola_gdr", "url": LOLA_URL, "native": "474 m (64 px/°)",
             "datum": "esfera de 1737.4 km"},
    "mars": {"source": "mola_megdr", "url": MOLA_URL, "native": "463 m (128 px/°)",
             "datum": "areoide MOLA"},
}
GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    GDAL_HTTP_MAX_RETRY="4",
    GDAL_HTTP_RETRY_DELAY="2",
    GDAL_HTTP_TIMEOUT="120",
    VSI_CACHE="TRUE",
    CPL_VSIL_CURL_CACHE_SIZE="67108864",
)


def body_radius(body: str) -> float:
    return float(config.constants()["bodies"][body]["mean_radius_m"])


def local_crs(body: str, lat: float, lon: float) -> CRS:
    if body == "earth":
        return CRS.from_proj4(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs")
    return CRS.from_proj4(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +R={body_radius(body)} +units=m +no_defs")


def geographic_crs(body: str) -> CRS:
    if body == "earth":
        return CRS.from_epsg(4326)
    return CRS.from_proj4(f"+proj=longlat +R={body_radius(body)} +no_defs")


def _grid(half_m: float, pixel_m: float):
    n = int(round(2 * half_m / pixel_m))
    return n, from_origin(-n * pixel_m / 2, n * pixel_m / 2, pixel_m, pixel_m)


def _copernicus_tiles(lat: float, lon: float, half_m: float) -> list[str]:
    """URLs of the 1x1 degree tiles intersecting the analysis window."""
    to_geo = Transformer.from_crs(local_crs("earth", lat, lon), geographic_crs("earth"), always_xy=True)
    edge = np.linspace(-half_m * 1.05, half_m * 1.05, 9)
    xs = np.concatenate([edge, edge, np.full(9, edge[0]), np.full(9, edge[-1])])
    ys = np.concatenate([np.full(9, edge[0]), np.full(9, edge[-1]), edge, edge])
    lons, lats = to_geo.transform(xs, ys)
    # Longitudes relative to the site so windows crossing the antimeridian stay contiguous.
    rel = (np.asarray(lons) - lon + 180.0) % 360.0 - 180.0
    lon_cells = range(math.floor(lon + rel.min()), math.floor(lon + rel.max()) + 1)
    lat_cells = range(math.floor(min(lats)), math.floor(max(lats)) + 1)
    urls = []
    for la in lat_cells:
        if not -90 <= la < 90:
            continue
        for lo in lon_cells:
            lo_w = (lo + 180) % 360 - 180
            urls.append(COPERNICUS_URL.format(
                ns="N" if la >= 0 else "S", lat=abs(la), ew="E" if lo_w >= 0 else "W", lon=abs(lo_w)))
    return urls


def _warp(src, dst_crs: CRS, transform, n: int, resampling: Resampling, scale: float = 1.0) -> np.ndarray:
    dst = np.full((n, n), np.nan, dtype="float32")
    reproject(
        source=rasterio.band(src, 1), destination=dst,
        src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
        dst_transform=transform, dst_crs=dst_crs, dst_nodata=np.nan,
        resampling=resampling,
    )
    return dst * scale


def local_dem(body: str, lat: float, lon: float,
              half_m: float | None = None, pixel_m: float | None = None) -> tuple[np.ndarray, dict]:
    """Elevation grid (metres, NaN = no data) centred on the site, plus metadata. Cached on disk."""
    half_m = half_m or config.WINDOW_HALF_M
    pixel_m = pixel_m or config.BASELINE_M
    cache = config.CACHE_DIR / "dem"
    cache.mkdir(parents=True, exist_ok=True)
    stem = f"{body}_{lat:.4f}_{lon:.4f}_{int(half_m)}_{int(pixel_m)}"
    npy, meta_path = cache / f"{stem}.npy", cache / f"{stem}.json"

    from .http import _fresh, _refresh  # reuse the cache policy
    import json
    if not _refresh and npy.exists() and _fresh(meta_path, config.CACHE_TTL_DAYS["dem"]):
        return np.load(npy), json.loads(meta_path.read_text())

    n, transform = _grid(half_m, pixel_m)
    dst_crs = local_crs(body, lat, lon)
    meta = {"retrieved_at": utc_now(), "body": body, **DEM_INFO[body], "tiles": [], "missing_tiles": []}
    with rasterio.Env(**GDAL_ENV):
        if body == "earth":
            z = np.full((n, n), np.nan, dtype="float32")
            for url in _copernicus_tiles(lat, lon, half_m):
                try:
                    with rasterio.open(url) as src:
                        part = _warp(src, dst_crs, transform, n, Resampling.average)
                except RasterioIOError:
                    meta["missing_tiles"].append(url)      # no tile = open ocean
                    continue
                meta["tiles"].append(url)
                z = np.where(np.isnan(z), part, z)
            # Copernicus DEM sets the sea surface to exactly 0 m: mask it so that
            # coastal windows are not biased towards a flat plain.
            sea = z == 0.0
            meta["sea_fraction"] = float(sea.mean())
            z[sea] = np.nan
        else:
            url = LOLA_URL if body == "moon" else MOLA_URL
            path = f"/vsicurl/{url}" if url.endswith(".lbl") else url
            with rasterio.open(path) as src:
                scale = src.scales[0] if src.scales and src.scales[0] else 1.0
                z = _warp(src, dst_crs, transform, n, Resampling.bilinear, scale=scale)
            meta["tiles"].append(url)
    meta["valid_fraction"] = float(np.isfinite(z).mean())
    np.save(npy, z)
    meta_path.write_text(json.dumps(meta))
    return z, meta


def terrain_metrics(z: np.ndarray, pixel_m: float) -> dict[str, float]:
    """Relief, slope and ruggedness of an elevation grid.

    Slope uses Horn's (1981) 3x3 finite differences; ruggedness is the Terrain
    Ruggedness Index of Riley et al. (1999): the root of the summed squared
    elevation differences between a cell and its eight neighbours.
    """
    z = np.asarray(z, dtype="float64")
    c = z[1:-1, 1:-1]
    nw, n_, ne = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    w_, e_ = z[1:-1, :-2], z[1:-1, 2:]
    sw, s_, se = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((ne + 2 * e_ + se) - (nw + 2 * w_ + sw)) / (8 * pixel_m)
    dzdy = ((sw + 2 * s_ + se) - (nw + 2 * n_ + ne)) / (8 * pixel_m)
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    tri = np.sqrt(sum((nb - c) ** 2 for nb in (nw, n_, ne, w_, e_, sw, s_, se)))
    p5, p95 = np.nanpercentile(z, [5, 95])
    return {
        "relief_m": float(p95 - p5),
        "slope_mean_deg": float(np.nanmean(slope)),
        "slope_p95_deg": float(np.nanpercentile(slope, 95)),
        "roughness_tri_m": float(np.nanmean(tri)),
        "ctx_elevation_mean_m": float(np.nanmean(z)),
        "ctx_elevation_min_m": float(np.nanmin(z)),
        "ctx_elevation_max_m": float(np.nanmax(z)),
    }


UNITS = {
    "relief_m": "m", "slope_mean_deg": "deg", "slope_p95_deg": "deg", "roughness_tri_m": "m",
    "ctx_elevation_mean_m": "m", "ctx_elevation_min_m": "m", "ctx_elevation_max_m": "m",
}


def measurements(entity_id: str, body: str, lat: float, lon: float) -> tuple[list[Measurement], list[Missing]]:
    try:
        z, meta = local_dem(body, lat, lon)
    except Exception as exc:   # network / GDAL failure: report, do not abort the run
        return [], [Missing(entity_id, p, f"DEM no disponible: {exc}", DEM_INFO[body]["source"]) for p in UNITS]
    if meta["valid_fraction"] < config.MIN_VALID_FRACTION:
        reason = f"solo {meta['valid_fraction']:.0%} de la ventana tiene elevación válida (mar o sin datos)"
        return [], [Missing(entity_id, p, reason, DEM_INFO[body]["source"]) for p in UNITS]
    values = terrain_metrics(z, config.BASELINE_M)
    note = (f"Ventana {2 * config.WINDOW_HALF_M / 1000:.0f} km, línea de base {config.BASELINE_M:.0f} m; "
            f"DEM nativo {meta['native']}; elevación respecto de {meta['datum']}; "
            f"{meta['valid_fraction']:.0%} de píxeles válidos")
    out = [
        Measurement(entity_id, name, value, UNITS[name],
                    "measured",
                    meta["source"], url=meta["url"], retrieved_at=meta["retrieved_at"], note=note)
        for name, value in values.items()
    ]
    return out, []
