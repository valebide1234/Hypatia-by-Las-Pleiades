"""Assemble every measurement for Earth sites and for lunar / Martian reference regions.

The output is a long table (one row per entity and parameter, with provenance)
plus a list of expected values that could not be obtained and why.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from . import config
from .insolation import annual_mean_insolation
from .provenance import Measurement, Missing, utc_now
from .sources import dem, diviner, gazetteer, mcd, nasa_power, rasters
from .sources.http import SourceError


def resolve_region(region: dict) -> tuple[dict, list[str]]:
    """Fill in a region's coordinates (IAU look-up when requested) and validate them."""
    warnings: list[str] = []
    c = region["coords"]
    out = {"id": region["id"], "body": region["body"], "name": region["name"]}
    if c["source"] == "iau":
        f = gazetteer.lookup(region["body"], c["feature"])
        out.update(lat=f["lat"], lon=f["lon"], coord_source=f"IAU Gazetteer: {f['name']} ({f['link']})")
    else:
        label = "misión" if c["source"] == "mission" else "publicación"
        out.update(lat=float(c["lat"]), lon=float(c["lon"]) % 360.0, coord_source=f"coordenadas de {label}")
        if c.get("host_feature"):
            try:
                f = gazetteer.lookup(region["body"], c["host_feature"])
                if gazetteer.contains(f, out["lat"], out["lon"]):
                    out["coord_source"] += f"; verificadas dentro de '{f['name']}' (IAU)"
                else:
                    warnings.append(f"{region['id']}: las coordenadas quedan fuera de '{f['name']}' según el Gazetteer IAU")
            except SourceError as exc:
                warnings.append(f"{region['id']}: no se pudo verificar con el Gazetteer IAU ({exc})")
    return out, warnings


def _geology(entity_id: str, item: dict) -> list[Measurement]:
    coded = item.get("geology", {})
    refs = ", ".join(item.get("refs", []))
    return [
        Measurement(entity_id, key, float(coded.get(key, 0)), "0/0.5/1", "expert_coded",
                    (item.get("refs") or [""])[0], note=f"Codificado a partir de: {refs}")
        for key in config.geology_keys()
    ]


def _literature(entity_id: str, item: dict) -> list[Measurement]:
    params = config.parameters()["parameters"]
    return [
        Measurement(entity_id, name, float(lit["value"]), params[name].get("unit", ""), lit.get("kind", "literature"),
                    (lit.get("refs") or [""])[0], note=lit.get("note", ""))
        for name, lit in item.get("literature", {}).items()
    ]


def earth_site_measurements(site: dict) -> tuple[list[Measurement], list[Missing], list[str]]:
    sid, lat, lon = site["id"], float(site["lat"]), float(site["lon"])
    ms, missing, warnings = [], [], []
    m, x = dem.measurements(sid, "earth", lat, lon)
    ms += m
    missing += x
    elev = next((q.value for q in m if q.parameter == "ctx_elevation_mean_m"), None)
    m, x = nasa_power.measurements(sid, lat, lon, site_elevation_m=elev)
    ms += m
    missing += x
    dz = next((q.value for q in m if q.parameter == "ctx_elevation_correction_m"), None)
    if dz:
        warnings.append(f"{sid}: la celda de reanálisis está {abs(dz):.0f} m {'por debajo' if dz > 0 else 'por encima'} "
                        "del sitio; temperatura y presión se corrigieron por elevación (dato derivado)")
    land = [m.value for m in ms if m.parameter == "ctx_land_fraction_1deg"]
    if land and land[0] < 0.6:
        warnings.append(f"{sid}: la celda climática es {1 - land[0]:.0%} océano; temperatura, viento y humedad "
                        "son representativos del entorno marino, no del terreno del sitio")
    ms += _geology(sid, site)
    ms.append(Measurement(sid, "ctx_access_score", float(site["access"]["score"]), "1-5", "expert_coded", "",
                          note=site["access"]["note"]))
    # Sanity check of hand-typed coordinates against published elevation.
    if "expected_elev_m" in site:
        lo, hi = site["expected_elev_m"]
        elev = [m.value for m in ms if m.parameter == "ctx_elevation_mean_m"]
        if elev and not (lo - 150 <= elev[0] <= hi + 150):
            warnings.append(f"{sid}: elevación media del DEM {elev[0]:.0f} m fuera del rango esperado {lo}-{hi} m; revisar coordenadas")
    return ms, missing, warnings


def region_measurements(region: dict) -> tuple[list[Measurement], list[Missing], list[str], dict]:
    loc, warnings = resolve_region(region)
    rid, body, lat, lon = loc["id"], loc["body"], loc["lat"], loc["lon"]
    ms, missing = [], []

    m, x = dem.measurements(rid, body, lat, lon)
    ms += m
    missing += x
    m, x = rasters.measurements(rid, body, lat, lon)
    ms += m
    missing += x

    now = utc_now()
    consts = config.constants()["bodies"][body]
    if body == "moon":
        m, x = diviner.measurements(rid, lat, lon)
        ms += m
        missing += x
        ms.append(Measurement(
            rid, "insolation_Wm2",
            annual_mean_insolation(lat, consts["solar_constant_Wm2"], consts["obliquity_deg"], consts["eccentricity"]),
            "W/m2", "modeled", "nssdca_factsheets", retrieved_at=now,
            note="Cálculo astronómico para superficie horizontal sin atmósfera; ignora sombras topográficas"
                 + (" (no fiable a esta latitud)" if abs(lat) > 80 else "")))
        ms.append(Measurement(rid, "pressure_Pa", consts["mean_surface_pressure_Pa"], "Pa", "literature", "stern1999",
                              retrieved_at=now, note="Exosfera lunar: orden de magnitud de la presión superficial nocturna"))
    else:
        m, x = mcd.measurements(rid, lat, lon)
        ms += m
        missing += x
    for name, why in (("precip_mm_yr", "sin precipitación líquida en las condiciones actuales"),
                      ("soil_wetness", "sin agua líquida en el suelo; el agua adsorbida o de hidratación no es comparable")):
        ms.append(Measurement(rid, name, 0.0, config.parameters()["parameters"][name]["unit"], "physical_zero",
                              "nssdca_factsheets", retrieved_at=now, note=f"Cero por física: {why}"))
    ms += _literature(rid, region)
    ms += _geology(rid, region)
    # A literature value overrides nothing: if a retrieved value exists it wins.
    seen, unique = set(), []
    for item in sorted(ms, key=lambda q: q.kind in ("literature",)):
        if (item.entity_id, item.parameter) in seen:
            continue
        seen.add((item.entity_id, item.parameter))
        unique.append(item)
    return unique, missing, warnings, loc


def build_all(max_workers: int = 4, progress=print) -> dict[str, pd.DataFrame | list]:
    """Retrieve everything for the catalogued Earth sites and reference regions."""
    measurements: list[Measurement] = []
    missing: list[Missing] = []
    warnings: list[str] = []
    entities: list[dict] = []

    def do_site(site):
        return site, earth_site_measurements(site)

    def do_region(region):
        return region, region_measurements(region)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        for site, (m, x, w) in pool.map(do_site, config.sites()):
            progress(f"  Tierra  {site['id']:<28} {len(m):>3} valores, {len(x)} faltantes")
            measurements += m
            missing += x
            warnings += w
            entities.append({"id": site["id"], "body": "earth", "name": site["name"], "lat": site["lat"],
                             "lon": site["lon"], "country": site["country"], "region": site["region"],
                             "geology_type": site["geology_type"], "summary": site["summary"],
                             "coord_source": f"catálogo ({site['coord_precision']})",
                             "access_score": site["access"]["score"], "access_note": site["access"]["note"],
                             "heritage": site.get("heritage", ""), "refs": ";".join(site.get("refs", [])),
                             "notes": site.get("notes", ""), "origin": "catalog",
                             "nasa_used": bool(site.get("nasa_use", {}).get("used", False)),
                             "nasa_program": site.get("nasa_use", {}).get("program", ""),
                             "used_by": site.get("nasa_use", {}).get("by", "")})
    # MCD and PDS servers are queried one region at a time to stay polite.
    for region in config.regions():
        try:
            m, x, w, loc = region_measurements(region)
        except SourceError as exc:
            warnings.append(f"{region['id']}: región omitida ({exc})")
            continue
        progress(f"  {region['body']:<6}  {region['id']:<28} {len(m):>3} valores, {len(x)} faltantes")
        measurements += m
        missing += x
        warnings += w
        entities.append({"id": region["id"], "body": region["body"], "name": region["name"], "lat": loc["lat"],
                         "lon": loc["lon"], "country": "", "region": "", "geology_type": region.get("terrain_class", ""),
                         "summary": region["summary"], "coord_source": loc["coord_source"], "access_score": None,
                         "access_note": "", "heritage": "", "refs": ";".join(region.get("refs", [])),
                         "notes": region.get("notes", ""), "origin": "catalog"})

    return {
        "measurements": pd.DataFrame([m.to_dict() for m in measurements]),
        "missing": pd.DataFrame([m.to_dict() for m in missing], columns=["entity_id", "parameter", "reason", "source"]),
        "entities": pd.DataFrame(entities),
        "warnings": warnings,
    }


def wide(measurements: pd.DataFrame, column: str = "value") -> pd.DataFrame:
    """Pivot the long table to one row per entity and one column per parameter."""
    return measurements.pivot_table(index="entity_id", columns="parameter", values=column, aggfunc="first")
