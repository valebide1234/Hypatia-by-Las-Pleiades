"""Dataset freshness: what is the newest data each upstream archive holds?

NASA's Common Metadata Repository (the catalogue behind Earthdata Search) is
asked for the most recent granule of the Earth-observation collections that feed
NASA POWER; for planetary archives the HTTP Last-Modified date of the product
file is reported. The result is written next to the outputs so every run states
how current its inputs were.
"""
from __future__ import annotations

from .. import config
from ..provenance import utc_now
from .http import SourceError, fetch_json, session

CMR = "https://cmr.earthdata.nasa.gov/search/"
EARTH_COLLECTIONS = [
    ("M2TMNXSLV", "MERRA-2 mensual, diagnósticos de superficie (temperatura, viento, presión)"),
    ("M2TMNXLND", "MERRA-2 mensual, superficie terrestre (humedad del suelo)"),
    ("M2TMNXAER", "MERRA-2 mensual, aerosoles (espesor óptico)"),
    ("MOD11C3", "MODIS/Terra temperatura de la superficie terrestre, mensual 0.05°"),
    ("MCD43C3", "MODIS albedo BRDF, 0.05°"),
]
ARCHIVE_FILES = [
    ("LRO Diviner GCP (temperatura lunar)", "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_00n10n_002.lbl"),
    ("LRO LOLA LDEM_64 (topografía lunar)", "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.lbl"),
    ("MGS MOLA MEGDR 463 m (topografía de Marte)", "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"),
    ("MGS TES albedo (Marte)", "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif"),
    ("MGS TES inercia térmica (Marte)", "https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_night_2007.lbl"),
    ("Copernicus DEM GLO-90 (tesela de ejemplo)", "https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_S25_00_W070_00_DEM/Copernicus_DSM_COG_30_S25_00_W070_00_DEM.tif"),
]


def latest_granule(short_name: str) -> dict:
    coll, _ = fetch_json(CMR + "collections.json", source="cmr",
                         params={"short_name": short_name, "page_size": 5, "sort_key": "-revision_date"})
    entries = coll.get("feed", {}).get("entry", [])
    if not entries:
        raise SourceError(f"CMR: collection {short_name} not found")
    c = entries[0]
    gran, _ = fetch_json(CMR + "granules.json", source="cmr",
                         params={"collection_concept_id": c["id"], "page_size": 1, "sort_key": "-start_date"})
    g = (gran.get("feed", {}).get("entry") or [{}])[0]
    return {
        "short_name": short_name, "version": c.get("version_id", ""), "title": c.get("dataset_id", ""),
        "collection_start": c.get("time_start", ""), "latest_granule_start": g.get("time_start", ""),
        "latest_granule_end": g.get("time_end", ""), "concept_id": c["id"],
    }


def freshness_report() -> dict:
    report = {"checked_at": utc_now(), "earth_collections": [], "planetary_archives": [],
              "earth_climate_window_years": config.EARTH_CLIMATE_YEARS}
    for short_name, label in EARTH_COLLECTIONS:
        try:
            report["earth_collections"].append({"label": label, **latest_granule(short_name)})
        except Exception as exc:
            report["earth_collections"].append({"label": label, "short_name": short_name, "error": str(exc)})
    for label, url in ARCHIVE_FILES:
        try:
            resp = session().head(url, timeout=60, allow_redirects=True)
            report["planetary_archives"].append({
                "label": label, "url": url, "status": resp.status_code,
                "last_modified": resp.headers.get("Last-Modified", ""),
            })
        except Exception as exc:
            report["planetary_archives"].append({"label": label, "url": url, "error": str(exc)})
    return report
