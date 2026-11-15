"""Per-site inventory of NASA Earthdata holdings, through the CMR catalogue.

Earthdata Search (https://search.earthdata.nasa.gov) is the web front end of NASA's
Common Metadata Repository. Asking CMR which granules cover a point is the same
query Earthdata Search runs when a user draws a point on its map, so this module
records, for every Earth site, how many scenes exist and how recent the newest
one is, together with a link that opens that exact search in Earthdata Search.
"""
from __future__ import annotations

from ..provenance import utc_now
from .http import SourceError, fetch_json, session

CMR = "https://cmr.earthdata.nasa.gov/search/"
COLLECTIONS = [
    ("MOD11A1", "061", "Temperatura de la superficie terrestre · MODIS/Terra, diaria, 1 km"),
    ("MCD43A3", "061", "Albedo · MODIS Terra+Aqua, diario, 500 m"),
]


def collection_id(short_name: str, version: str) -> str:
    data, _ = fetch_json(CMR + "collections.json", source="cmr",
                         params={"short_name": short_name, "version": version, "page_size": 1})
    entries = data.get("feed", {}).get("entry", [])
    if not entries:
        raise SourceError(f"CMR: collection {short_name} v{version} not found")
    return entries[0]["id"]


def search_link(concept_id: str, lat: float, lon: float) -> str:
    """URL that reproduces the query in the Earthdata Search web interface."""
    return f"https://search.earthdata.nasa.gov/search/granules?p={concept_id}&sp[0]={lon:.4f}%2C{lat:.4f}"


def site_inventory(lat: float, lon: float) -> list[dict]:
    rows = []
    for short_name, version, label in COLLECTIONS:
        row = {"short_name": short_name, "version": version, "label": label, "checked_at": utc_now()}
        try:
            cid = collection_id(short_name, version)
            resp = session().get(CMR + "granules.json", timeout=60, params={
                "collection_concept_id": cid, "point": f"{lon:.4f},{lat:.4f}",
                "page_size": 1, "sort_key": "-start_date"})
            resp.raise_for_status()
            entry = (resp.json().get("feed", {}).get("entry") or [{}])[0]
            row.update(granules=int(resp.headers.get("CMR-Hits", 0)), latest=entry.get("time_start", ""),
                       latest_granule=entry.get("title", ""), concept_id=cid, query_url=resp.url,
                       earthdata_search_url=search_link(cid, lat, lon))
        except Exception as exc:
            row["error"] = str(exc)[:200]
        rows.append(row)
    return rows
