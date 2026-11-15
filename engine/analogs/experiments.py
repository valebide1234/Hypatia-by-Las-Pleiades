"""Experimental applications: what a matched pair is good for, and what it is not."""
from __future__ import annotations

import pandas as pd

from . import config
from .i18n import tr as _

# Experiments enabled when a feature is present both at the Earth site and in the region.
MATCH_EXPERIMENTS = {
    "g_basalt": "Caracterización in situ de basaltos (XRF, LIBS, Raman, VNIR) y selección de muestras.",
    "g_anorthosite": "Ensayos con material feldespático: fabricación de simulantes, extracción de oxígeno y sinterizado.",
    "g_volcanic": "Cartografía geológica y muestreo de coladas y conos; protocolos de travesía en terreno volcánico.",
    "g_lava_tubes": "Exploración robótica y cartografía de tubos de lava; evaluación como refugio.",
    "g_pyroclastic": "Excavación y manejo de depósitos piroclásticos sueltos; prospección de recursos.",
    "g_impact": "Geología de impacto (brechas, eyecta, estratigrafía de cráteres) y entrenamiento de tripulaciones.",
    "g_aeolian": "Movilidad de rovers sobre dunas y ripples; medición de transporte eólico de arena.",
    "g_fluvial_lacustrine": "Sedimentología de deltas y lagos; estrategia de muestreo para biofirmas en sedimentos finos.",
    "g_evaporite": "Detección de sales y salmueras; habitabilidad en ambientes hipersalinos.",
    "g_sulfate": "Espectroscopía de sulfatos y preservación de materia orgánica en sulfatos.",
    "g_iron_oxide": "Identificación de óxidos de hierro y jarosita (Mössbauer, VNIR); geoquímica ácida.",
    "g_clay": "Detección de filosilicatos y perforación en lutitas; preservación de compuestos orgánicos.",
    "g_carbonate": "Detección de carbonatos y de biofirmas asociadas.",
    "g_perchlorate": "Efecto de sales oxidantes en la detección de orgánicos (pirólisis, GC-MS).",
    "g_silica": "Búsqueda de biofirmas en depósitos de sílice hidrotermal.",
    "g_ground_ice": "Perforación y muestreo de hielo subsuperficial; radar de penetración; prospección de volátiles.",
    "g_periglacial": "Cartografía de suelos poligonales y su relación con el hielo enterrado.",
    "g_loose_regolith": "Excavación, tracción y mitigación de polvo en material suelto.",
}
NUMERIC_EXPERIMENTS = {
    "slope_mean_deg": "Ensayos de movilidad y navegación en pendientes representativas de la región.",
    "roughness_tri_m": "Validación de detección de peligros y planificación de rutas en rugosidad comparable.",
    "tsurf_mean_K": "Operación de equipos en un régimen térmico medio comparable.",
    "diurnal_range_K": "Ensayo de materiales y mecanismos bajo una amplitud térmica diurna comparable.",
    "precip_mm_yr": "Estudios en aridez extrema: estabilidad de sales, límites de la actividad biológica.",
    "insolation_Wm2": "Dimensionamiento y ensayo de generación solar con insolación comparable.",
    "dust_optical_depth": "Degradación de paneles y ópticas por depósito de polvo atmosférico.",
}


def suggest(detail: pd.DataFrame) -> list[str]:
    """Experiments supported by features the pair actually shares."""
    out = []
    d = detail.set_index("parameter")
    for key, text in MATCH_EXPERIMENTS.items():
        if key in d.index and d.loc[key, "status"] == "scored" and min(d.loc[key, "earth_value"], d.loc[key, "target_value"]) >= 0.5:
            out.append(_(text))
    for key, text in NUMERIC_EXPERIMENTS.items():
        if key in d.index and d.loc[key, "status"] == "scored" and d.loc[key, "similarity"] >= 0.75:
            out.append(_(text))
    return out


def not_reproducible(body: str, objective_id: str | None = None) -> list[dict]:
    items = config.constants()["not_reproducible"][body]
    if objective_id and objective_id != "balanced":
        items = [i for i in items if objective_id in i["affects"]]
    return [{**i, "item": _(i["item"]), "why": _(i["why"])} for i in items]


def feasible(objective_id: str) -> list[str]:
    f = config.constants()["feasible_on_earth"]
    if objective_id == "balanced":
        return [_(x) for x in sorted({x for v in f.values() for x in v})[:8]]
    return [_(x) for x in f.get(objective_id, [])]


def best_by_objective(scores: pd.DataFrame, entities: pd.DataFrame, body: str, n: int = 5) -> pd.DataFrame:
    """For every experimental objective, the best site-region pairs on a body."""
    names = entities.set_index("id")["name"]
    access = entities.set_index("id")["access_score"]
    s = scores[(scores["body"] == body) & (scores["objective"] != "balanced")]
    top = s.sort_values("score", ascending=False).groupby("objective").head(n).copy()
    top["site"] = top["site_id"].map(names)
    top["region"] = top["region_id"].map(names)
    top["access_score"] = top["site_id"].map(access)
    top["objective_label"] = top["objective"].map({k: v["label"] for k, v in config.objectives().items()})
    return top[["objective", "objective_label", "site", "region", "score", "confidence_label", "coverage",
                "access_score", "site_id", "region_id"]]
