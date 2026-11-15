"""Paths, analysis settings and catalogue loading/validation."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
CATALOG_DIR = ROOT / "data" / "catalog"
CACHE_DIR = ROOT / "data" / "cache"
PROCESSED_DIR = ROOT / "data" / "processed"
REPORTS_DIR = ROOT / "reports"

# ---------------------------------------------------------------- analysis settings
# Terrain is always analysed on the same footprint and baseline on every body.
WINDOW_HALF_M = 20_000.0       # half-size of the square analysis window (40 x 40 km)
BASELINE_M = 463.0             # common DEM posting = native MOLA MEGDR resolution
MIN_VALID_FRACTION = 0.25      # minimum share of valid DEM pixels (land) to report terrain metrics

# Earth climate statistics use the most recent N complete calendar years.
EARTH_CLIMATE_YEARS = 10

# Cache time-to-live (days). After this the pipeline re-downloads the product, so
# periodic runs always pick up the latest data each archive publishes.
CACHE_TTL_DAYS = {
    "nasa_power": 30,     # near-real-time reanalysis: refresh monthly
    "mcd": 180,           # model database: new versions are infrequent
    "diviner": 365,       # archived PDS products (static between releases)
    "pds_raster": 365,
    "gazetteer": 90,
    "cmr": 1,
    "naturalearth": 365,
    "dem": 365,
}

BODIES = ("moon", "mars")


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=None)
def parameters() -> dict:
    return load_yaml(CONFIG_DIR / "parameters.yaml")


@lru_cache(maxsize=None)
def objectives() -> dict:
    return load_yaml(CONFIG_DIR / "objectives.yaml")["objectives"]


@lru_cache(maxsize=None)
def constants() -> dict:
    return load_yaml(CATALOG_DIR / "planetary_constants.yaml")


@lru_cache(maxsize=None)
def references() -> dict:
    return load_yaml(CATALOG_DIR / "references.yaml")


@lru_cache(maxsize=None)
def regions() -> list[dict]:
    return load_yaml(CATALOG_DIR / "reference_regions.yaml")["regions"]


@lru_cache(maxsize=None)
def challenge_links() -> list[dict]:
    return load_yaml(CATALOG_DIR / "challenge_links.yaml")["links"]


@lru_cache(maxsize=None)
def sites() -> list[dict]:
    return load_yaml(CATALOG_DIR / "earth_sites.yaml")["sites"]


def geology_keys() -> list[str]:
    return [k for k, v in parameters()["parameters"].items() if v["mode"] == "ordinal"]


def numeric_keys() -> list[str]:
    return [k for k, v in parameters()["parameters"].items() if v["mode"] != "ordinal"]


def validate_catalogs() -> list[str]:
    """Return a list of problems found in the hand-written catalogues (empty = OK)."""
    problems: list[str] = []
    refs = references()
    gkeys = set(geology_keys())
    params = parameters()["parameters"]
    cats = set(parameters()["categories"])

    for key, p in params.items():
        if p["category"] not in cats:
            problems.append(f"parameter {key}: unknown category {p['category']}")
        if p["mode"] != "ordinal" and "scale" not in p:
            problems.append(f"parameter {key}: missing scale")

    seen: set[str] = set()
    for kind, items in (("region", regions()), ("site", sites())):
        for it in items:
            iid = it.get("id", "?")
            if iid in seen:
                problems.append(f"duplicate id {iid}")
            seen.add(iid)
            for r in it.get("refs", []):
                if r not in refs:
                    problems.append(f"{kind} {iid}: unknown reference '{r}'")
            for g, v in it.get("geology", {}).items():
                if g not in gkeys:
                    problems.append(f"{kind} {iid}: unknown geology descriptor '{g}'")
                if v not in (0, 0.5, 1):
                    problems.append(f"{kind} {iid}: descriptor {g} must be 0, 0.5 or 1")
            for name, lit in it.get("literature", {}).items():
                if name not in params:
                    problems.append(f"{kind} {iid}: literature value for unknown parameter '{name}'")
                for r in lit.get("refs", []):
                    if r not in refs:
                        problems.append(f"{kind} {iid}: unknown reference '{r}'")
            if kind == "site":
                if not (-90 <= it["lat"] <= 90 and -180 <= it["lon"] <= 180):
                    problems.append(f"site {iid}: coordinates out of range")
                if "used" not in it.get("nasa_use", {}):
                    problems.append(f"site {iid}: missing nasa_use.used")
            else:
                if it["body"] not in BODIES:
                    problems.append(f"region {iid}: unknown body {it['body']}")
                c = it["coords"]
                if c["source"] not in ("mission", "publication", "iau"):
                    problems.append(f"region {iid}: unknown coords source {c['source']}")
                if c["source"] in ("mission", "publication") and not (-90 <= c["lat"] <= 90 and 0 <= c["lon"] <= 360):
                    problems.append(f"region {iid}: coordinates out of range (lon must be 0-360 E)")
                if c["source"] == "iau" and not c.get("feature"):
                    problems.append(f"region {iid}: iau coords need a feature name")

    for oid, obj in objectives().items():
        for c in obj["category_weights"]:
            if c not in cats:
                problems.append(f"objective {oid}: unknown category {c}")
        for p in obj.get("parameter_multipliers", {}):
            if p not in params:
                problems.append(f"objective {oid}: unknown parameter {p}")
    return problems
