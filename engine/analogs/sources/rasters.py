"""Point/area sampling of global planetary raster maps read remotely with GDAL.

    Mars  TES bolometric albedo (USGS mosaic, 7.4 km/px)                 -> scored
    Mars  TES night-side thermal inertia (PDS, 20 px/deg)                -> context
    Moon  Kaguya Multiband Imager mineral maps (USGS, 4 px/deg, 50S-50N) -> context
"""
from __future__ import annotations

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

from ..provenance import Measurement, Missing, utc_now
from .dem import GDAL_ENV, body_radius, geographic_crs

USGS = "https://planetarymaps.usgs.gov/mosaic/"
PDS_TI = "https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_night_2007.lbl"
KAGUYA = USGS + "Lunar_MI_mineral_maps/4ppd/Lunar_Kaguya_MIMap_MineralDeconv_{}_50N50S.tif"

PRODUCTS = {
    "mars": [
        dict(parameter="albedo", url=USGS + "Mars_MGS_TES_Albedo_mosaic_global_7410m.tif", unit="-",
             source="tes_albedo", valid=(0.01, 1.0),
             note="Albedo bolométrico TES (0.3-2.9 µm), media en un radio de 20 km"),
        dict(parameter="ctx_thermal_inertia_tiu", url=PDS_TI, unit="J m-2 K-1 s-1/2",
             source="tes_timap", valid=(5, 5000),
             note="Inercia térmica nocturna TES (Putzig y Mellon 2007), media en un radio de 20 km"),
    ],
    "moon": [
        dict(parameter="ctx_feo_wtpct", url=KAGUYA.format("FeOWeightPercent"), unit="% en peso",
             source="kaguya_mi_minerals", valid=(0.0, 40.0), note="FeO, Kaguya MI, media en un radio de 20 km"),
        dict(parameter="ctx_plagioclase_pct", url=KAGUYA.format("PlagioclasePercent"), unit="%",
             source="kaguya_mi_minerals", valid=(0.0, 100.0), note="Plagioclasa, Kaguya MI, media en un radio de 20 km"),
        dict(parameter="ctx_olivine_pct", url=KAGUYA.format("OlivinePercent"), unit="%",
             source="kaguya_mi_minerals", valid=(0.0, 100.0), note="Olivino, Kaguya MI, media en un radio de 20 km"),
        dict(parameter="ctx_clinopyroxene_pct", url=KAGUYA.format("ClinopyroxenePercent"), unit="%",
             source="kaguya_mi_minerals", valid=(0.0, 100.0), note="Clinopiroxeno, Kaguya MI, media en un radio de 20 km"),
        dict(parameter="ctx_orthopyroxene_pct", url=KAGUYA.format("OrthopyroxenePercent"), unit="%",
             source="kaguya_mi_minerals", valid=(0.0, 100.0), note="Ortopiroxeno, Kaguya MI, media en un radio de 20 km"),
    ],
}


def sample_mean(url: str, body: str, lat: float, lon: float, radius_m: float,
                valid: tuple[float, float]) -> tuple[float, int]:
    """Mean of valid pixels within `radius_m` of the point. Returns (mean, n_pixels)."""
    path = f"/vsicurl/{url}" if url.endswith(".lbl") else url
    with rasterio.Env(**GDAL_ENV), rasterio.open(path) as ds:
        to_ds = Transformer.from_crs(geographic_crs(body), ds.crs, always_xy=True)
        x, y = to_ds.transform((lon + 180.0) % 360.0 - 180.0, lat)
        if ds.crs.is_geographic:
            radius = np.degrees(radius_m / body_radius(body))
            rx, ry = radius / max(np.cos(np.radians(lat)), 0.05), radius
        else:
            # Equirectangular maps stretch east-west distances by 1/cos(lat).
            rx, ry = radius_m / max(np.cos(np.radians(lat)), 0.05), radius_m
        row, col = ds.index(x, y)
        half_r = max(0, int(round(ry / abs(ds.res[1]))))
        half_c = max(0, int(round(rx / abs(ds.res[0]))))
        if not (0 <= row < ds.height and 0 <= col < ds.width):
            return float("nan"), 0
        r0, r1 = max(0, row - half_r), min(ds.height, row + half_r + 1)
        c0, c1 = max(0, col - half_c), min(ds.width, col + half_c + 1)
        a = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype("float64")
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
        a[(a < valid[0]) | (a > valid[1])] = np.nan
        n = int(np.isfinite(a).sum())
        return (float(np.nanmean(a)) if n else float("nan")), n


def measurements(entity_id: str, body: str, lat: float, lon: float,
                 radius_m: float = 20_000.0) -> tuple[list[Measurement], list[Missing]]:
    out, missing = [], []
    for p in PRODUCTS.get(body, []):
        try:
            value, n = sample_mean(p["url"], body, lat, lon, radius_m, p["valid"])
        except Exception as exc:
            missing.append(Missing(entity_id, p["parameter"], f"ráster no disponible: {exc}", p["source"]))
            continue
        if n == 0:
            missing.append(Missing(entity_id, p["parameter"], "fuera de la cobertura del mapa o sin píxeles válidos", p["source"]))
            continue
        out.append(Measurement(entity_id, p["parameter"], value, p["unit"], "measured", p["source"],
                               url=p["url"], retrieved_at=utc_now(), note=f"{p['note']} ({n} píxeles)"))
    return out, missing
