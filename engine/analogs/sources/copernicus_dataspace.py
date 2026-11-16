"""Copernicus Data Space Ecosystem catalogue: most recent Sentinel-2 scene over a point.

The catalogue (OData) can be searched without an account; downloading products cannot,
so only the scene metadata is recorded.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..provenance import utc_now
from .http import session

CATALOGUE = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"


def latest_sentinel2(lat: float, lon: float, days: int = 60) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00.000Z")
    params = {
        "$filter": ("Collection/Name eq 'SENTINEL-2' and "
                    f"OData.CSDL.Intersects(area=geography'SRID=4326;POINT({lon:.4f} {lat:.4f})') and "
                    f"ContentDate/Start gt {since}"),
        "$orderby": "ContentDate/Start desc", "$top": 1,
    }
    row = {"checked_at": utc_now()}
    try:
        resp = session().get(CATALOGUE, params=params, timeout=90)
        resp.raise_for_status()
        items = resp.json().get("value", [])
        row["query_url"] = resp.url
        if items:
            it = items[0]
            row.update(product=it["Name"], acquired=it.get("ContentDate", {}).get("Start", ""),
                       published=it.get("PublicationDate", ""), online=bool(it.get("Online")))
        else:
            row["product"] = ""
            row["note"] = f"sin escenas en los últimos {days} días (noche polar o sin cobertura)"
    except Exception as exc:
        row["error"] = str(exc)[:200]
    return row
