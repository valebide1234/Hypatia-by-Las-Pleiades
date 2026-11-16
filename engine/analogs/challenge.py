"""Which page of the challenge does each number come from, and the evidence that it was used.

`link_for_source` maps the source key stored with every measurement to one of the
pages listed in the challenge. `build_evidence` then gathers verifiable proof for each
page: how many stored values came from it, the exact URLs that were requested, and a
set of live checks (catalogue queries, product labels, downloaded images).
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from . import config
from .provenance import utc_now
from .sources import copernicus_dataspace, earthdata, textures, worldview
from .sources.http import session

PDS_LABELS = {
    "pds_diviner": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_00n10n_002.lbl",
    "pds_lro": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.lbl",
    "pds": "https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_night_2007.lbl",
}
# Text that must appear in the challenge page itself, showing it leads to the archive that is read.
PAGE_MARKERS = {
    "pds_diviner": "urn-nasa-pds-lro_diviner_derived1",
    "pds_lro": "diviner.htm",
}


def link_for_source(source: str) -> dict | None:
    """The first (most specific) challenge link whose data includes this source key."""
    for link in config.challenge_links():
        if source in link.get("sources", []):
            return link
    return None


def page_label(source: str) -> str:
    """Short name of the page a source key belongs to, for tables and reports."""
    if not isinstance(source, str) or not source:
        return "—"
    link = link_for_source(source)
    if link:
        return link.get("short", link["title"])
    other = config.load_yaml(config.CATALOG_DIR / "challenge_links.yaml").get("other_sources", {})
    if source in other:
        return other[source]
    ref = config.references().get(source, {})
    return "Literatura científica" if ref.get("kind") == "paper" else "Otra fuente"


def usage_by_link(measurements: pd.DataFrame) -> pd.DataFrame:
    """Stored values, entities and requested URLs attributed to each challenge page."""
    rows = []
    for link in config.challenge_links():
        m = measurements[measurements["source"].isin(link.get("sources", []))]
        # A value is attributed to the most specific page only, so totals do not double count.
        own = m.loc[m["source"].map(lambda s: (link_for_source(s) or {}).get("id") == link["id"]).astype(bool)]
        urls = [u for u in pd.unique(own["url"].dropna()) if isinstance(u, str) and u]
        rows.append({"id": link["id"], "group": link["group"], "title": link["title"], "url": link["url"],
                     "used": link["used"], "endpoint": link.get("endpoint", ""),
                     "values": int(len(own)), "entities": int(own["entity_id"].nunique()),
                     "parameters": int(own["parameter"].nunique()),
                     "last_retrieved": own["retrieved_at"].dropna().max() if len(own) else "",
                     "example_urls": urls[:3]})
    return pd.DataFrame(rows)


def _label_fields(url: str) -> dict:
    """Read a PDS label and return the fields that identify the archived product."""
    out = {"label_url": url}
    try:
        resp = session().get(url, timeout=60)
        out["http_status"] = resp.status_code
        text = resp.text
        for key in ("DATA_SET_ID", "PRODUCT_ID", "INSTRUMENT_NAME", "TARGET_NAME", "PRODUCER_FULL_NAME",
                    "START_TIME", "STOP_TIME", "PRODUCT_CREATION_TIME"):
            m = re.search(rf"^\s*{key}\s*=\s*\"?([^\"\r\n]+)\"?", text, re.M)
            if m:
                out[key.lower()] = m.group(1).strip()
        out["last_modified"] = resp.headers.get("Last-Modified", "")
    except Exception as exc:
        out["error"] = str(exc)[:200]
    return out


def _page_check(link: dict) -> dict:
    """Is the challenge page reachable, and does it point to the archive that is read?"""
    out = {}
    try:
        resp = session().get(link["url"], timeout=60)
        out["page_status"] = resp.status_code
        marker = PAGE_MARKERS.get(link["id"])
        if marker:
            out["page_links_to_archive"] = marker in resp.text
            out["marker"] = marker
    except Exception as exc:
        out["page_error"] = str(exc)[:200]
    return out


def build_evidence(tables: dict, progress=print) -> dict:
    """Run the live checks and write the evidence files next to the processed tables."""
    out_dir = config.PROCESSED_DIR
    ent = tables["entities"]
    earth = ent[(ent["body"] == "earth")]
    evidence = {"checked_at": utc_now(), "links": {}}

    usage = usage_by_link(tables["measurements"])
    for link in config.challenge_links():
        row = usage[usage["id"] == link["id"]].iloc[0].to_dict()
        row.update(what=link["what"], how=" ".join(str(link["how"]).split()))
        if link["group"] == "primeros":
            row.update(_page_check(link))
        if link["id"] in PDS_LABELS:
            row["product_label"] = _label_fields(PDS_LABELS[link["id"]])
        evidence["links"][link["id"]] = row

    progress("  Earthdata (CMR): inventario de escenas por sitio...")
    def inv(r):
        return [{"site_id": r.id, "site": r.name, **x} for x in earthdata.site_inventory(r.lat, r.lon)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        inventory = pd.DataFrame([x for rows in pool.map(inv, earth.itertuples()) for x in rows])
    inventory.to_csv(out_dir / "earthdata_inventory.csv", index=False)
    ok = inventory[inventory.get("granules").notna()] if "granules" in inventory else inventory.iloc[0:0]
    evidence["links"]["earthdata_search"].update(
        cmr_queries=int(len(ok)), granules_found=int(ok["granules"].sum()) if len(ok) else 0,
        latest_granule=str(ok["latest"].max()) if len(ok) else "")

    progress("  Worldview: imagen satelital de cada sitio y texturas del globo...")
    def snap(r):
        try:
            return worldview.snapshot(r.id, r.lat, r.lon)
        except Exception as exc:
            return {"site_id": r.id, "error": str(exc)[:200]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        snaps = pd.DataFrame(list(pool.map(snap, earth.itertuples())))
    snaps.to_csv(out_dir / "worldview_snapshots.csv", index=False)
    tex = []
    for layer in (worldview.DEFAULT_LAYER, worldview.SNAPSHOT_LAYER):
        try:
            p = worldview.global_texture(layer)
            tex.append({"layer": layer, "file": p.name, "bytes": p.stat().st_size})
        except Exception as exc:
            tex.append({"layer": layer, "error": str(exc)[:200]})
    evidence["links"]["worldview"].update(
        snapshots=int(snaps["file"].notna().sum()) if "file" in snaps else 0, globe_textures=tex,
        layers_available=list(worldview.LAYERS))
    for body in ("moon", "mars"):
        try:
            textures.planet_texture(body)
        except Exception as exc:
            progress(f"    textura de {body} no disponible: {exc}")

    progress("  Copernicus Data Space: escena Sentinel-2 más reciente por sitio...")
    def s2(r):
        return {"site_id": r.id, "site": r.name, **copernicus_dataspace.latest_sentinel2(r.lat, r.lon)}
    with ThreadPoolExecutor(max_workers=3) as pool:
        scenes = pd.DataFrame(list(pool.map(s2, earth.itertuples())))
    scenes.to_csv(out_dir / "copernicus_scenes.csv", index=False)
    found = scenes["product"].fillna("").ne("").sum() if "product" in scenes else 0
    evidence["links"]["copernicus_dataspace"].update(catalogue_queries=int(len(scenes)), scenes_found=int(found))

    (out_dir / "challenge_evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False, default=str))
    return evidence
