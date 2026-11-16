"""Lunar surface temperatures measured by LRO Diviner.

Product: Diviner Global Cumulative Products (GCP), NASA PDS Geosciences Node
(Williams et al. 2017). Bolometric brightness temperature binned at 0.5 deg in
latitude/longitude and 0.25 h of local time, from all nadir observations between
2009-07-05 and 2015-04-01.

The tables are fixed-width ASCII (113 bytes per row) ordered by longitude, then
latitude, then local time, so the 96 rows of one map bin (its full diurnal
curve) can be read with a single HTTP Range request instead of downloading the
156 MB latitude band.
"""
from __future__ import annotations

import math

import numpy as np

from ..provenance import Measurement, Missing
from .http import SourceError, fetch_range

BASE = "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/"
ROW_BYTES = 113
N_LTIM = 96          # 0.25 h bins
N_LAT = 20           # 0.5 deg bins per 10 deg band
N_LON = 720
FILL = -9999.0
MIN_BINS = 48        # at least half of the diurnal cycle must be observed


def band_file(lat: float) -> tuple[str, float]:
    """File name of the 10-degree latitude band containing `lat`, and the band's southern edge."""
    lo = min(8, max(-9, math.floor(lat / 10.0))) * 10
    hi = lo + 10
    if lo >= 0:
        name = f"global_cumul_avg_cyl_{lo:02d}n{hi:02d}n_002.tab"
    else:
        name = f"global_cumul_avg_cyl_{-lo:02d}s{-hi:02d}s_002.tab"
    return name, float(lo)


def _read_bin(lat: float, lon: float) -> tuple[np.ndarray, np.ndarray, dict]:
    name, lat0 = band_file(lat)
    lon = (lon + 180.0) % 360.0 - 180.0
    ilon = min(N_LON - 1, int(math.floor((lon + 180.0) / 0.5)))
    ilat = min(N_LAT - 1, max(0, int(math.floor((lat - lat0) / 0.5))))
    row = (ilon * N_LAT + ilat) * N_LTIM
    raw, meta = fetch_range(BASE + name, ROW_BYTES * (1 + row), ROW_BYTES * N_LTIM, source="diviner")
    rows = [r.split(",") for r in raw.decode("ascii").strip().splitlines()]
    data = np.array([[float(x) for x in r] for r in rows])
    # The byte offset is computed, not searched for: verify we landed on the right bin.
    clon, clat = data[0, 0], data[0, 1]
    if abs(clon - (-179.75 + 0.5 * ilon)) > 1e-6 or abs(clat - (lat0 + 0.25 + 0.5 * ilat)) > 1e-6:
        raise SourceError(f"Diviner GCP: unexpected bin ({clon}, {clat}) for request ({lon}, {lat})")
    ltim, tbol = data[:, 2], data[:, 10]
    tbol = np.where((tbol == FILL) | (tbol <= 0), np.nan, tbol)
    meta["bin"] = {"clon": float(clon), "clat": float(clat), "file": name}
    return ltim, tbol, meta


def diurnal_curve(lat: float, lon: float) -> tuple[np.ndarray, np.ndarray, dict]:
    """Local time (h) and bolometric temperature (K) for the 0.5 deg bin containing the point.

    If the bin itself is sparsely observed, the eight neighbouring bins are averaged in.
    """
    ltim, tbol, meta = _read_bin(lat, lon)
    meta["bins_used"] = 1
    if np.isfinite(tbol).sum() < 0.75 * N_LTIM:
        stack = [tbol]
        for dlat in (-0.5, 0.0, 0.5):
            for dlon in (-0.5, 0.0, 0.5):
                if dlat == 0 and dlon == 0:
                    continue
                la = lat + dlat
                if not -90 < la < 90:
                    continue
                try:
                    stack.append(_read_bin(la, lon + dlon)[1])
                except SourceError:
                    continue
        with np.errstate(all="ignore"):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                tbol = np.nanmean(np.vstack(stack), axis=0)
        meta["bins_used"] = len(stack)
    return ltim, tbol, meta


def summarize(ltim: np.ndarray, tbol: np.ndarray) -> dict[str, float]:
    valid = np.isfinite(tbol)
    if valid.sum() < MIN_BINS:
        raise SourceError(f"Diviner GCP: only {int(valid.sum())} of {N_LTIM} local-time bins observed")
    # Fill unobserved local times by periodic linear interpolation before averaging,
    # so the mean is not biased towards the better-sampled part of the day.
    filled = np.interp(ltim, ltim[valid], tbol[valid], period=24.0)
    return {
        "tsurf_mean_K": float(filled.mean()),
        "tsurf_min_K": float(np.nanmin(tbol)),
        "tsurf_max_K": float(np.nanmax(tbol)),
        "diurnal_range_K": float(np.nanmax(tbol) - np.nanmin(tbol)),
        "ctx_diviner_bins_observed": float(valid.sum()),
    }


UNITS = {"tsurf_mean_K": "K", "tsurf_min_K": "K", "tsurf_max_K": "K", "diurnal_range_K": "K",
         "ctx_diviner_bins_observed": "of 96"}


def measurements(entity_id: str, lat: float, lon: float) -> tuple[list[Measurement], list[Missing]]:
    try:
        ltim, tbol, meta = diurnal_curve(lat, lon)
        values = summarize(ltim, tbol)
    except SourceError as exc:
        return [], [Missing(entity_id, p, f"Diviner GCP: {exc}", "diviner_gcp") for p in UNITS if not p.startswith("ctx_")]
    note = (f"Temperatura de brillo bolométrica, celda de 0.5° centrada en "
            f"({meta['bin']['clat']:.2f}, {meta['bin']['clon']:.2f}); {meta['bins_used']} celda(s) promediadas; "
            f"{int(values['ctx_diviner_bins_observed'])}/96 intervalos de hora local observados")
    return [
        Measurement(entity_id, name, value, UNITS[name], "measured", "diviner_gcp",
                    url=BASE + meta["bin"]["file"], retrieved_at=meta["retrieved_at"],
                    period="2009-07-05/2015-04-01", note=note)
        for name, value in values.items()
    ], []
