"""Export of the engine's full analysis for the Lab page of the Hypatia app.

Writes public/engine/lab.json: everything the page needs to compare any Earth place with
any mission region in the browser (the scoring rule is re-implemented there and checked
against `checks`), to draw the environment model, to list applications and limits, and
to show which sources every value came from.

Texts that exist in the catalogues are exported in Spanish (the language they were
written in) and English; the app adds Italian.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import __version__, challenge, config, experiments, i18n, ml, proposals, similarity
from .discovery import haversine_km
from .hypatia_export import HYPATIA_ROOT, MIN_LAND_FRACTION, PROGRAM, _num
from .provenance import utc_now
from .sources import dem, landmask, nasa_power

DEFAULT_OUT = HYPATIA_ROOT / "public" / "engine" / "lab.json"
SAME_SITE_KM = 50.0          # a Hypatia site this close to an engine reference site is the same place
ALT_METHODS = ("euclidean", "mahalanobis", "cosine")


def bi(text, generated: bool = False):
    """Spanish (as written in the catalogue) and English versions of a catalogue text."""
    if not isinstance(text, str) or not text.strip():
        return None
    es = " ".join(text.split())
    i18n.set_lang("en")
    en = i18n.tg(es) if generated else i18n.tr(es)
    return {"es": es, "en": en}


def _clean(d: dict, digits: int = 4) -> dict:
    """Finite values only. Features keep 7 significant digits (lunar pressure is 3e-10 Pa), so
    the browser's score agrees with this engine's; `digits` is used for the small check tables."""
    out = {}
    for k, v in d.items():
        try:
            x = float(v)
        except (TypeError, ValueError):
            continue
        if np.isfinite(x):
            out[k] = float(f"{x:.7g}") if digits == 4 else round(x, digits)
    return out


def parameters_block() -> dict:
    cfg = config.parameters()
    params = {}
    for key, p in cfg["parameters"].items():
        params[key] = {
            "label": bi(p["label"]), "category": p["category"], "mode": p["mode"],
            "unit": p.get("unit", "0/0.5/1"), "transform": p.get("transform", "identity"),
            "scale": p.get("scale"), "floor": p.get("floor"),
            "appliesTo": p.get("applies_to", list(config.BODIES)),
            "comparability": p.get("comparability", {}),
            "note": bi(p.get("note")),
        }
    cats = {k: {"label": bi(c["label"]), "order": c["order"]} for k, c in cfg["categories"].items()}
    objectives = {k: {"label": bi(o["label"]), "description": bi(o["description"]),
                      "categoryWeights": o["category_weights"],
                      "parameterMultipliers": o.get("parameter_multipliers", {})}
                  for k, o in config.objectives().items()}
    return {"parameters": params, "categories": cats, "objectives": objectives,
            "dataQuality": cfg["data_quality"],
            "confidenceLevels": [{"min": thr, "label": bi(lbl)} for thr, lbl in similarity.CONFIDENCE_LABELS]}


def site_profile(site: dict) -> tuple[dict, dict, dict, list[str]]:
    """Climate and terrain of a Hypatia site, measured exactly as the engine measures its own sites."""
    sid, lat, lon = site["id"], float(site["lat"]), float(site["lon"])
    values, kinds, src, notes = {}, {}, {}, []
    terrain, _ = dem.measurements(sid, "earth", lat, lon)
    elev = next((m.value for m in terrain if m.parameter == "ctx_elevation_mean_m"), None)
    try:
        land = landmask.land_fraction_1deg(lat, lon)
    except Exception:
        land = float("nan")
    climate = []
    if np.isfinite(land) and land < MIN_LAND_FRACTION:
        notes.append(f"The climate grid cell is {1 - land:.0%} ocean, so no climate value is reported for this site.")
    else:
        climate, _ = nasa_power.measurements(sid, lat, lon, site_elevation_m=elev)
        if any(m.kind == "derived" and m.parameter == "tsurf_mean_K" for m in climate):
            notes.append("The reanalysis grid cell and the site differ in elevation by more than 300 m; "
                         "temperature and pressure were corrected for elevation (derived values).")
    if not terrain:
        notes.append("No valid land elevation in the 40 km window: terrain is not reported.")
    for m in [*terrain, *climate]:
        values[m.parameter], kinds[m.parameter], src[m.parameter] = m.value, m.kind, m.source
    return values, kinds, src, notes


def build(tables: dict, hypatia_dir: Path = HYPATIA_ROOT, progress=print) -> dict:
    i18n.set_lang("en")
    ent = tables["entities"].set_index("id")
    feats, kinds, meas = tables["features"], tables["kinds"], tables["measurements"]
    src_table = meas.pivot_table(index="entity_id", columns="parameter", values="source", aggfunc="first")
    param_keys = list(config.parameters()["parameters"])
    geology_keys = [k for k, p in config.parameters()["parameters"].items() if p["mode"] == "ordinal"]
    hyp_sites = json.loads((hypatia_dir / "data" / "sites.json").read_text(encoding="utf-8"))["sites"]
    engine_sites = {s["id"]: s for s in config.sites()}

    def entity_block(eid: str) -> tuple[dict, dict, dict]:
        f = feats.loc[eid].dropna().to_dict() if eid in feats.index else {}
        k = kinds.loc[eid].dropna().to_dict() if eid in kinds.index else {}
        s = src_table.loc[eid].dropna().to_dict() if eid in src_table.index else {}
        return _clean(f), k, s

    # ---- Earth places: Hypatia's catalogue, then the engine's reference sites it does not have
    places, matched = [], set()
    for site in hyp_sites:
        values, vkinds, vsrc, notes = site_profile(site)
        twin = min(engine_sites.values(), key=lambda e: float(haversine_km(site["lat"], site["lon"], e["lat"], e["lon"])))
        geology_from = None
        if float(haversine_km(site["lat"], site["lon"], twin["lat"], twin["lon"])) <= SAME_SITE_KM:
            matched.add(twin["id"])
            geology_from = twin["id"]
            for g in geology_keys:      # descriptors coded from the literature for this same site
                values[g] = float(twin.get("geology", {}).get(g, 0.0))
                vkinds[g], vsrc[g] = "expert_coded", "expert_coding"
        else:
            notes.append("Geological descriptors have not been coded for this site, so geology is not scored.")
        places.append({
            "id": site["id"], "group": "catalogue", "name": {"en": site["name"]}, "country": {"en": site["country"]},
            "lat": site["lat"], "lon": site["lon"], "origin": site["origin"], "targets": site["targets"],
            "features": _clean(values), "kinds": vkinds, "src": vsrc, "notes": notes,
            "geologyRefs": twin.get("refs", []) if geology_from else [],
        })
    for p in proposals.load():
        m = proposals.measure(p)
        values, vkinds, vsrc, notes = dict(m["values"]), dict(m["kinds"]), dict(m["src"]), list(m["notes"])
        twin = min(engine_sites.values(), key=lambda e: float(haversine_km(p["lat"], p["lon"], e["lat"], e["lon"])))
        geology_from = None
        if float(haversine_km(p["lat"], p["lon"], twin["lat"], twin["lon"])) <= SAME_SITE_KM:
            matched.add(twin["id"])
            geology_from = twin["id"]
            for g in geology_keys:
                values[g] = float(twin.get("geology", {}).get(g, 0.0))
                vkinds[g], vsrc[g] = "expert_coded", "expert_coding"
        else:
            notes.append("Geological descriptors have not been coded for this place, so geology is not scored.")
        places.append({
            "id": f"team:{p['id']}", "group": "proposal", "name": {"en": p["name"]}, "country": {"en": p["country"]},
            "lat": float(p["lat"]), "lon": float(p["lon"]), "origin": "hypatia_candidate", "targets": p["targets"],
            "summary": p["rationale"], "features": _clean(values), "kinds": vkinds, "src": vsrc, "notes": notes,
            "geologyRefs": twin.get("refs", []) if geology_from else [],
        })
    for eid, s in engine_sites.items():
        if eid in matched or eid not in feats.index:
            continue
        f, k, sr = entity_block(eid)
        places.append({
            "id": f"ref:{eid}", "group": "reference", "name": bi(s["name"]), "country": bi(s["country"]),
            "lat": s["lat"], "lon": s["lon"], "origin": "nasa_official" if s["nasa_use"]["used"] else "literature",
            "targets": list(config.BODIES), "summary": bi(s["summary"]), "program": bi(s["nasa_use"]["program"]),
            "features": f, "kinds": k, "src": sr, "notes": [], "geologyRefs": s.get("refs", []),
        })
    n_prop = sum(1 for x in places if x["group"] == "proposal")
    progress(f"  {len(places)} Earth places ({len(hyp_sites)} in Hypatia's catalogue, {n_prop} proposed by the team, "
             f"{len(places) - len(hyp_sites) - n_prop} engine reference sites)")

    # ---- grid cells of the discovery scan, so a new candidate can be opened in the Lab
    cells = {}
    if "discovery_cells" in tables:
        grid_cells = tables["discovery_cells"].set_index("id")
        keep = [c for c in grid_cells.columns if c in param_keys or c in ("ctx_uv_index", "ctx_elevation_mean_m")]
        for cid, row in grid_cells.iterrows():
            f = _clean(row[keep].to_dict())
            if f:
                cells[cid] = {"lat": float(row["lat"]), "lon": float(row["lon"]), "features": f}

    # ---- mission regions
    regions = []
    for r in config.regions():
        f, k, sr = entity_block(r["id"])
        row = ent.loc[r["id"]]
        regions.append({
            "id": r["id"], "target": r["body"], "name": bi(r["name"]), "summary": bi(r["summary"]),
            "notes": bi(r.get("notes")), "program": PROGRAM.get(r["id"], "Other"),
            "lat": _num(row["lat"], 3), "lon": _num(row["lon"], 3), "coordSource": bi(row.get("coord_source"), generated=True),
            "features": f, "kinds": k, "src": sr, "refs": r.get("refs", []),
        })

    # ---- reference numbers to check the browser's scoring against this engine's
    place_frame = pd.DataFrame({p["id"]: p["features"] for p in places}).T.reindex(columns=param_keys)
    kind_frame = pd.DataFrame({p["id"]: p["kinds"] for p in places}).T.reindex(columns=param_keys)
    checks = []
    samples = [("atacama-yungay", "jezero_crater", "balanced"), ("haughton-crater", "phoenix_vastitas", "water_ice_detection"),
               ("meteor-crater", "apollo16_descartes", "planetary_geology"), ("ref:white_sands", "olympia_undae", "rover_mobility"),
               ("mcmurdo-dry-valleys", "gale_crater", "astrobiology"), ("lanzarote", "marius_hills", "balanced"),
               ("aquarius-reef-base", "shackleton_south_pole", "balanced")]
    for pid, rid, oid in samples:
        if pid not in place_frame.index:
            continue
        body = ent.loc[rid, "body"]
        res = similarity.score_pair(place_frame.loc[pid], feats.loc[rid], body, oid, None, kind_frame.loc[pid], kinds.loc[rid])
        checks.append({"place": pid, "region": rid, "objective": oid, "score": _num(res["score"], 6),
                       "coverage": _num(res["coverage"], 6), "confidence": _num(res["confidence"], 6),
                       "categories": _clean(res["category_scores"], 6), "scored": res["n_scored"]})

    # ---- other ways of measuring similarity: the best places for each region under each
    alt = {}
    for r in config.regions():
        alt[r["id"]] = {}
        for method in ALT_METHODS:
            out = similarity.alternative_scores(place_frame, feats.loc[r["id"]], r["body"], method)
            top = out["score"].dropna().sort_values(ascending=False).head(5)
            alt[r["id"]][method] = {
                "top": [{"place": pid, "score": _num(v, 3)} for pid, v in top.items()],
                "variables": out.attrs.get("variables", []), "outOfRange": out.attrs.get("out_of_range", []),
            }

    # ---- environment model (unsupervised, trained on the grid)
    model = None
    if ml.available():
        meta = ml.metadata()
        grid = pd.read_csv(config.PROCESSED_DIR / "environment_cells.csv")
        clusters = [{**{k: c[k] for k in ("id", "cells", "pc1", "pc2", "rarity")},
                     "name": {"es": c["name"], "en": i18n.tr_env(c["name"])},
                     "tsurfMeanC": _num(c["tsurf_mean_K"] - 273.15, 0), "precipMmYr": _num(c["precip_mm_yr"], 0),
                     "albedo": _num(c["albedo"], 2)} for c in meta["clusters"]]
        desc = ml.describe(place_frame.reindex(columns=meta["features"]), "earth")
        placed = {pid: {"cluster": int(d["cluster"]), "rarity": _num(d["rarity"], 3), "pc1": _num(d["pc1"], 3),
                        "pc2": _num(d["pc2"], 3), "imputed": int(d["imputed"])} for pid, d in desc.iterrows()}
        region_points = {}
        for r in config.regions():
            f = feats.loc[r["id"]]
            d = ml.describe(pd.DataFrame([f]), r["body"]).iloc[0]
            within, beyond = ml.comparable_variables(f, r["body"])
            near = ml.nearest_cells_to(f, r["body"], k=8)
            region_points[r["id"]] = {
                "pc1": _num(d["pc1"], 3), "pc2": _num(d["pc2"], 3), "within": within, "beyond": beyond,
                "nearest": [{"lat": float(n.lat), "lon": float(n.lon), "cluster": int(n.cluster),
                             "rarity": _num(n.rarity, 2), "distance": _num(n.distance, 3)} for n in near.itertuples()],
            }
        model = {
            "trainedAt": meta["trained_at"], "cells": int(meta["n_cells"]), "features": meta["features"],
            "silhouette": meta["silhouette"], "explainedVariance": meta["pca"]["explained_variance"],
            "loadings": meta["pca"]["loadings"], "stability": meta["stability"], "trees": meta["isolation_forest"]["trees"],
            "clusters": clusters,
            "grid": [[float(g.lat), float(g.lon), _num(g.pc1, 2), _num(g.pc2, 2), int(g.cluster), _num(g.rarity, 2)]
                     for g in grid.itertuples()],
            "places": placed, "regions": region_points,
        }

    # ---- applications: what a matched pair is good for, and what Earth cannot reproduce
    consts = config.constants()
    bodies = {}
    for body, b in consts["bodies"].items():
        bodies[body] = {"label": bi(b["label"]), "gravity": b["surface_gravity_ms2"], "solarConstant": b["solar_constant_Wm2"],
                        "solarDayHours": b["solar_day_hours"], "pressurePa": b.get("mean_surface_pressure_Pa"),
                        "atmosphere": bi(b["atmosphere"]), "radiation": bi(consts["radiation"][body]["value"])}
    applications = {
        "bodies": bodies,
        "notReproducible": {body: [{"item": bi(i["item"]), "why": bi(i["why"]), "affects": i["affects"]} for i in items]
                            for body, items in consts["not_reproducible"].items()},
        "feasible": {k: [bi(x) for x in v] for k, v in consts["feasible_on_earth"].items()},
        "shared": {k: bi(v) for k, v in experiments.MATCH_EXPERIMENTS.items()},
        "similar": {k: bi(v) for k, v in experiments.NUMERIC_EXPERIMENTS.items()},
    }

    # ---- sources: which page every value came from, how recent it is, what is missing
    links_yaml = config.load_yaml(config.CATALOG_DIR / "challenge_links.yaml")
    usage = challenge.usage_by_link(meas).set_index("id")
    links = []
    for link in links_yaml["links"]:
        u = usage.loc[link["id"]]
        links.append({"id": link["id"], "group": "first" if link["group"] == "primeros" else "additional",
                      "title": link["title"], "url": link["url"], "used": link["used"], "endpoint": link.get("endpoint", ""),
                      "what": bi(link["what"]), "how": bi(link["how"]), "sources": link.get("sources", []),
                      "values": int(u["values"]), "entities": int(u["entities"]), "exampleUrls": list(u["example_urls"])[:2]})
    refs = {k: {"cite": r.get("cite", ""), "url": r.get("url", ""), "kind": r.get("kind", ""),
                "page": bi(challenge.page_label(k))} for k, r in config.references().items()}
    fresh_path = config.PROCESSED_DIR / "freshness.json"
    fresh = json.loads(fresh_path.read_text()) if fresh_path.exists() else {}
    missing = []
    if len(tables.get("missing", [])):
        labels = {k: p["label"] for k, p in config.parameters()["parameters"].items()}
        names = ent["name"].to_dict()
        for row in tables["missing"].itertuples():
            missing.append({"entity": bi(names.get(row.entity_id, row.entity_id)), "parameter": bi(labels.get(row.parameter, row.parameter)) or {"en": row.parameter, "es": row.parameter},
                            "reason": bi(row.reason, generated=True)})
    sources = {
        "links": links, "references": refs, "missing": missing,
        "otherSources": {k: bi(v) for k, v in links_yaml.get("other_sources", {}).items()},
        "freshness": {"checkedAt": fresh.get("checked_at"),
                      "collections": [{"shortName": c.get("short_name"), "title": c.get("title"), "version": c.get("version"),
                                       "latest": c.get("latest_granule_end") or c.get("latest_granule_start")}
                                      for c in fresh.get("earth_collections", [])],
                      "archives": [{"label": bi(a["label"]), "url": a["url"], "lastModified": a.get("last_modified")}
                                   for a in fresh.get("planetary_archives", [])]},
        "valuesStored": int(len(meas)),
    }

    start, end = nasa_power.default_period()
    return {
        "schema": 1, "generatedAt": utc_now(), "engineVersion": __version__,
        "climatePeriod": {"start": start, "end": end},
        "windowKm": 2 * config.WINDOW_HALF_M / 1000, "baselineM": config.BASELINE_M,
        **parameters_block(),
        "places": places, "cells": cells, "regions": regions, "checks": checks, "alternative": alt,
        "model": model, "applications": applications, "sources": sources,
    }


def write(tables: dict, out_path: Path = DEFAULT_OUT, hypatia_dir: Path = HYPATIA_ROOT, progress=print) -> Path:
    data = build(tables, hypatia_dir, progress)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return out_path
