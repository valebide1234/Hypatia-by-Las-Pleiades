"""Scientific report (Markdown) for one Earth site matched to one lunar/Martian region.

The report is written in the language selected in analogs.i18n (Spanish or English).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config, experiments, similarity
from .i18n import tg, tr as _

KIND_LABEL = {
    "measured": "medido", "reanalysis": "reanálisis", "modeled": "modelado", "derived": "derivado",
    "literature": "literatura", "expert_coded": "codificado de literatura", "physical_zero": "cero físico",
}
STATUS_LABEL = {
    "scored": "", "missing_earth": "sin dato terrestre", "missing_target": "sin dato de la región",
    "not_applicable": "no aplicable", "excluded_by_objective": "excluido por el objetivo",
    "joint_absence": "ausente en ambos",
}
BODY_LABEL = {"moon": "Luna", "mars": "Marte", "earth": "Tierra"}
NEUTRAL_PAGES = ("—", "Literatura científica", "Otra fuente")


def kind_label(kind) -> str:
    return _(KIND_LABEL.get(kind, "—")) if isinstance(kind, str) else "—"


def fmt(value, unit: str = "") -> str:
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return "—"
    v = float(value)
    if unit == "0/0.5/1":
        return _({0.0: "ausente", 0.5: "presente", 1.0: "dominante"}.get(v, f"{v:g}"))
    if v == 0:
        return "0"
    if abs(v) >= 1e5 or abs(v) < 1e-3:
        return f"{v:.2e}"
    if abs(v) >= 100:
        return f"{v:.0f}"
    if abs(v) >= 10:
        return f"{v:.1f}"
    return f"{v:.2f}"


def cite(key: str) -> str:
    ref = config.references().get(key)
    if not ref:
        return key
    text = ref["cite"]
    if ref.get("doi"):
        text += f" https://doi.org/{ref['doi']}"
    elif ref.get("url"):
        text += f" {ref['url']}"
    return text


def worldview_link(lat: float, lon: float, half_deg: float = 1.5) -> str:
    return (f"https://worldview.earthdata.nasa.gov/?v={lon - half_deg * 2:.3f},{lat - half_deg:.3f},"
            f"{lon + half_deg * 2:.3f},{lat + half_deg:.3f}"
            "&l=Reference_Labels_15m(hidden),Coastlines_15m,MODIS_Terra_CorrectedReflectance_TrueColor")


def earthdata_search_link(lat: float, lon: float) -> str:
    return f"https://search.earthdata.nasa.gov/search?lat={lat:.4f}&long={lon:.4f}&zoom=7"


def pair_result(tables: dict, site_id: str, region_id: str, objective_id: str = "balanced",
                overrides: dict | None = None) -> dict:
    f, k = tables["features"], tables["kinds"]
    body = tables["entities"].set_index("id").loc[region_id, "body"]
    return similarity.score_pair(f.loc[site_id], f.loc[region_id], body, objective_id, overrides,
                                 k.loc[site_id] if site_id in k.index else None, k.loc[region_id])


def alternative_ranks(tables: dict, site_id: str, region_id: str, objective_id: str) -> dict:
    """Rank of the site among catalogued Earth sites under each alternative metric."""
    ent = tables["entities"].set_index("id")
    earth_ids = [i for i in ent.index[(ent["body"] == "earth")] if i in tables["features"].index]
    earth = tables["features"].loc[earth_ids]
    body = ent.loc[region_id, "body"]
    out = {}
    for method in ("euclidean", "mahalanobis", "cosine"):
        s = similarity.alternative_scores(earth, tables["features"].loc[region_id], body, method, objective_id)
        if site_id in s.index and np.isfinite(s.loc[site_id, "score"]):
            rank = int(s["score"].rank(ascending=False, method="min").loc[site_id])
            out[method] = _("puesto {rank} de {n} ({k} variables)").format(
                rank=rank, n=int(s["score"].notna().sum()), k=int(s.loc[site_id, "n_variables"]))
        else:
            out[method] = _("no calculable (datos insuficientes)")
        params = config.parameters()["parameters"]
        out["out_of_range"] = [_(params[n]["label"]) for n in s.attrs.get("out_of_range", [])]
    return out


def build_report(tables: dict, site_id: str, region_id: str, objective_id: str = "balanced",
                 overrides: dict | None = None) -> str:
    ent = tables["entities"].set_index("id")
    site, region = ent.loc[site_id], ent.loc[region_id]
    body = region["body"]
    body_name = _(BODY_LABEL[body])
    objective = config.objectives()[objective_id]
    obj_label = _(objective["label"])
    res = pair_result(tables, site_id, region_id, objective_id, overrides)
    detail = res["detail"]
    exp = similarity.explain(res, top=6)
    cats = config.parameters()["categories"]
    consts = config.constants()
    m = tables["measurements"]
    meas = m[m["entity_id"].isin([site_id, region_id])]
    site_name, region_name = _(site["name"]), _(region["name"])

    # Rank among the catalogued sites for this region and objective.
    earth_ids = [i for i in ent.index[ent["body"] == "earth"] if i in tables["features"].index]
    all_scores = pd.Series({e: pair_result(tables, e, region_id, objective_id, overrides)["score"] for e in earth_ids})
    rank = int(all_scores.rank(ascending=False, method="min").get(site_id, np.nan)) if site_id in all_scores else None

    L: list[str] = []
    L.append(_("# Informe de análogo: {site} ↔ {region}").format(site=site_name, region=region_name))
    L.append(_("*Objetivo: {objective} · Generado con datos recuperados el {date}*").format(
        objective=obj_label, date=meas["retrieved_at"].dropna().max()[:10] if len(meas) else "n/d") + "\n")

    L.append(_("## 1. Ubicación terrestre"))
    country = _(site["country"]) if isinstance(site.get("country"), str) and site["country"] else ""
    L.append(_("- **Sitio:** {name}").format(name=site_name) + (f" ({country})" if country else ""))
    L.append(_("- **Coordenadas:** {lat:.3f}°, {lon:.3f}° (WGS84; {source})").format(
        lat=site["lat"], lon=site["lon"], source=tg(site["coord_source"])))
    if isinstance(site.get("summary"), str) and site["summary"]:
        L.append(_("- **Descripción:** {text}").format(text=tg(_(site["summary"]))))
    if pd.notna(site.get("access_score")):
        L.append(_("- **Accesibilidad para campo:** {score}/5 — {note} *(valoración cualitativa)*").format(
            score=int(site["access_score"]), note=_(site["access_note"])))
    if isinstance(site.get("heritage"), str) and site["heritage"]:
        L.append(_("- **Uso previo como análogo:** {text}").format(text=_(site["heritage"])))
    if site.get("origin") != "custom":
        if bool(site.get("nasa_used")):
            L.append(_("- **Uso por la NASA:** sí. {program}").format(program=_(site["nasa_program"])))
        else:
            L.append(_("- **Uso por la NASA:** sin uso documentado en este catálogo. Usado por: {by}.").format(
                by=_(site["used_by"]) if isinstance(site.get("used_by"), str) and site["used_by"] else "—"))
    L.append(_("- **Imágenes satelitales actuales:** [NASA Worldview]({wv}) · [Earthdata Search]({es})").format(
        wv=worldview_link(site["lat"], site["lon"]), es=earthdata_search_link(site["lat"], site["lon"])) + "\n")

    L.append(_("## 2. Región correspondiente en {body}").format(body=body_name))
    L.append(_("- **Región:** {name}").format(name=region_name))
    L.append(_("- **Coordenadas:** {lat:.3f}°, {lon:.3f}° E (planetocéntricas; {source})").format(
        lat=region["lat"], lon=region["lon"], source=tg(region["coord_source"])))
    L.append(_("- **Descripción:** {text}").format(text=_(region["summary"])))
    if isinstance(region.get("notes"), str) and region["notes"]:
        L.append(_("- **Nota:** {text}").format(text=_(region["notes"])))
    L.append("")

    L.append(_("## 3. Puntuación global de similitud"))
    line = _("**{score:.2f}** sobre 1 (método de tolerancias ponderadas, objetivo «{objective}»)").format(
        score=res["score"], objective=obj_label)
    line += (_(" — puesto {rank} de {n} sitios catalogados para esta región.").format(rank=rank, n=len(all_scores))
             if rank else ".")
    L.append(line)
    L.append("\n" + _("Confianza: **{label}** (cobertura de datos {coverage:.0%}, calidad media de datos {quality:.2f}).").format(
        label=_(res["confidence_label"]), coverage=res["coverage"], quality=res["data_quality"]) + "\n")
    L.append(_("> Una puntuación alta indica cercanía en las variables comparadas, dentro de las tolerancias "
               "declaradas. No demuestra que los dos ambientes sean equivalentes: la gravedad, la radiación y "
               "la presión atmosférica quedan fuera de lo que cualquier sitio terrestre puede reproducir (sección 8).") + "\n")
    L.append(_("| Categoría | Similitud | Peso | Cobertura |"))
    L.append("|---|---|---|---|")
    cw = similarity.category_weights(objective, overrides)
    for c, info in sorted(cats.items(), key=lambda kv: kv[1]["order"]):
        sc, cv = res["category_scores"].get(c), res["category_coverage"].get(c)
        L.append(f"| {_(info['label'])} | {fmt(sc)} | {cw.get(c, 0):.0%} | "
                 f"{'—' if cv is None or not np.isfinite(cv) else f'{cv:.0%}'} |")
    L.append("")

    L.append(_("## 4. Similitud por parámetro"))
    L.append(_("Valores absolutos en unidades comunes; la similitud ya incorpora la transformación (lineal o "
               "logarítmica) y la tolerancia de cada parámetro.") + "\n")
    earth_name = _("Tierra")
    for c, info in sorted(cats.items(), key=lambda kv: kv[1]["order"]):
        d = detail[(detail["category"] == c) & (detail["status"] != "joint_absence")]
        if d.empty:
            continue
        L.append(f"**{_(info['label'])}**\n")
        L.append(_("| Parámetro | {earth} | {body} | Unidad | Similitud | Peso efectivo | Tipo de dato ({earth} / {body}) |").format(
            earth=earth_name, body=body_name))
        L.append("|---|---|---|---|---|---|---|")
        for _i, r in d.iterrows():
            sim = fmt(r["similarity"]) if r["status"] == "scored" else f"*{_(STATUS_LABEL[r['status']])}*"
            w = f"{r.get('effective_weight', np.nan):.1%}" if r["status"] == "scored" and np.isfinite(r.get("effective_weight", np.nan)) else "—"
            kinds = f"{kind_label(r['earth_kind'])} / {kind_label(r['target_kind'])}"
            unit = "" if r["unit"] == "0/0.5/1" else _(r["unit"])
            L.append(f"| {_(r['label'])} | {fmt(r['earth_value'], r['unit'])} | {fmt(r['target_value'], r['unit'])} | {unit} | {sim} | {w} | {kinds} |")
        L.append("")
    absent = [_(x) for x in detail[detail["status"] == "joint_absence"]["label"].tolist()]
    if absent:
        L.append(_("*Ausentes en ambos (no puntúan):* {items}.").format(items=", ".join(absent)) + "\n")

    L.append(_("## 5. Principales similitudes geológicas"))
    geo = detail[(detail["mode"] == "ordinal") & (detail["status"] == "scored")]
    shared = geo[(geo["earth_value"] >= 0.5) & (geo["target_value"] >= 0.5)]
    if shared.empty:
        L.append(_("No hay rasgos geológicos o mineralógicos compartidos entre los descriptores codificados."))
    for _i, r in shared.iterrows():
        L.append(_("- **{label}**: {a} en el sitio terrestre, {b} en la región.").format(
            label=_(r["label"]), a=fmt(r["earth_value"], "0/0.5/1"), b=fmt(r["target_value"], "0/0.5/1")))
    only_t = [_(x) for x in geo[(geo["earth_value"] < 0.5) & (geo["target_value"] >= 0.5)]["label"].tolist()]
    only_e = [_(x) for x in geo[(geo["earth_value"] >= 0.5) & (geo["target_value"] < 0.5)]["label"].tolist()]
    if only_t:
        L.append("\n" + _("Presentes en la región pero no en el sitio terrestre: {items}.").format(items=", ".join(only_t)))
    if only_e:
        L.append("\n" + _("Presentes en el sitio terrestre pero no en la región: {items}.").format(items=", ".join(only_e)))
    L.append("\n" + _("*Los descriptores geológicos son una codificación ordinal de la literatura citada, no mediciones.*") + "\n")

    L.append(_("## 6. Principales diferencias ambientales"))
    env = detail[(detail["status"] == "scored") & (detail["mode"] != "ordinal") & (detail["similarity"] < 0.6)
                 & detail["category"].isin(["environment", "water"])]
    env = env.sort_values("similarity")
    if env.empty:
        L.append(_("Ninguna variable ambiental comparada difiere más allá de su tolerancia."))
    for _i, r in env.iterrows():
        u = "" if r["unit"] in ("-", "0-1") else f" {_(r['unit'])}"
        L.append(_("- **{label}**: {a}{u} en la Tierra frente a {b}{u} en la región (similitud {s:.2f}).").format(
            label=_(r["label"]), a=fmt(r["earth_value"]), b=fmt(r["target_value"]), u=u, s=r["similarity"]))
    e_c, b_c = consts["bodies"]["earth"], consts["bodies"][body]
    L.append("\n" + _("Diferencias planetarias fijas (fuera de la puntuación):"))
    L.append(_("- Gravedad: {a} m/s² frente a {b} m/s².").format(a=e_c["surface_gravity_ms2"], b=b_c["surface_gravity_ms2"]))
    L.append(_("- Atmósfera: {a} frente a {b}.").format(a=_(e_c["atmosphere"]), b=_(b_c["atmosphere"])))
    L.append(_("- Constante solar: {a:.0f} W/m² frente a {b:.0f} W/m².").format(a=e_c["solar_constant_Wm2"], b=b_c["solar_constant_Wm2"]))
    L.append(_("- Duración del día solar: {a} h frente a {b} h.").format(a=e_c["solar_day_hours"], b=b_c["solar_day_hours"]))
    L.append(_("- Radiación: {a} frente a {b}.").format(a=_(consts["radiation"]["earth"]["value"]),
                                                       b=_(consts["radiation"][body]["value"])) + "\n")

    L.append(_("## 7. Experimentos posibles"))
    sugg = experiments.suggest(detail)
    if sugg:
        L.append(_("Respaldados por rasgos que el sitio y la región comparten:"))
        L += [f"- {s}" for s in sugg]
    else:
        L.append(_("Los datos comparados no respaldan experimentos específicos para este par."))
    feas = experiments.feasible(objective_id)
    if feas:
        L.append("\n" + _("Ensayos de campo factibles para el objetivo «{objective}»:").format(objective=obj_label))
        L += [f"- {s}" for s in feas]
    L.append("")

    L.append(_("## 8. Limitaciones de la analogía"))
    L.append(_("Fenómenos de {body} que no se reproducen en ningún sitio terrestre:").format(body=body_name))
    for item in experiments.not_reproducible(body):
        L.append(f"- **{item['item']}.** {item['why']}")
    L.append("\n" + _("Limitaciones de los datos y del método:"))
    L.append(_("- La topografía se compara en una ventana de {w:.0f} × {w:.0f} km a una línea de base de {b:.0f} m; "
               "no describe la rugosidad a escala de rover (metros).").format(
        w=2 * config.WINDOW_HALF_M / 1000, b=config.BASELINE_M))
    L.append(_("- El clima terrestre procede de un reanálisis de ~50 km de resolución: describe la celda, no el microclima del afloramiento."))
    if body == "mars":
        L.append(_("- Las variables atmosféricas y térmicas de Marte son salida del Mars Climate Database (modelo), no "
                   "mediciones in situ; el viento del modelo no resuelve circulaciones locales de cráteres o cañones."))
    else:
        L.append(_("- La temperatura lunar es temperatura de brillo bolométrica de Diviner promediada en celdas de 0.5° "
                   "(~15 km en el ecuador): mezcla zonas iluminadas y en sombra."))
        L.append(_("- El albedo lunar es un valor de literatura por tipo de terreno, no una medición del sitio."))
    L.append(_("- Los descriptores geológicos son ordinales y no capturan abundancias, edades ni texturas."))
    L.append(_("- No se comparan densidad de cráteres ni granulometría: no hay un producto global homogéneo para los tres cuerpos.") + "\n")

    L.append(_("## 9. Fuentes de datos y referencias"))
    used = meas[meas["parameter"].isin(detail[detail["status"].isin(["scored", "joint_absence"])]["parameter"])]
    keys = [k for k in pd.unique(used["source"].dropna()) if k]
    for ent_row in (site, region):
        if isinstance(ent_row.get("refs"), str):
            keys += [k for k in ent_row["refs"].split(";") if k]
    seen = []
    for k in keys:
        if k not in seen:
            seen.append(k)
    for k in seen:
        when = used[used["source"] == k]["retrieved_at"].dropna()
        suffix = (" " + _("*(consultado {date})*").format(date=when.max()[:10])
                  if len(when) and config.references().get(k, {}).get("kind") == "dataset" else "")
        L.append(f"- {cite(k)}{suffix}")
    L.append("")

    L.append(_("**Páginas del desafío de las que provienen los datos de esta comparación**") + "\n")
    L.append(_("| Página | Lugar | Valores | Parámetros |"))
    L.append("|---|---|---|---|")
    labels = {p: v["label"] for p, v in config.parameters()["parameters"].items()}
    for (page, eid), grp in used.groupby(["challenge_page", "entity_id"]):
        if page in NEUTRAL_PAGES:
            continue
        shown = [_(labels.get(p, p)) for p in grp["parameter"] if not p.startswith("g_")]
        if not shown:
            continue
        who = site_name if eid == site_id else region_name
        L.append(f"| {_(page)} | {who} | {len(shown)} | {', '.join(shown)} |")
    L.append("")

    L.append(_("## 10. Confianza y calidad de los datos"))
    L.append(_("- **Confianza global:** {label} ({value:.2f} = cobertura × calidad).").format(
        label=_(res["confidence_label"]), value=res["confidence"]))
    L.append(_("- **Parámetros puntuados:** {n}; **sin dato:** {k}.").format(n=res["n_scored"], k=res["n_missing"]))
    scored = detail[detail["status"] == "scored"]
    for side, col in ((earth_name, "earth_kind"), (body_name, "target_kind")):
        counts = scored[col].map(kind_label).value_counts()
        L.append(_("- **Tipo de dato, {side}:** {items}.").format(
            side=side, items=", ".join(f"{n} {k}" for k, n in counts.items())))
    for item in exp["missing"]:
        L.append(_("- **Dato faltante:** {label} ({status}).").format(label=_(item["label"]), status=_(STATUS_LABEL[item["status"]])))
    miss = tables["missing"]
    if len(miss):
        for _i, r in miss[miss["entity_id"].isin([site_id, region_id])].iterrows():
            L.append(_("- **No recuperado:** `{parameter}` de `{entity}` — {reason}").format(
                parameter=r["parameter"], entity=r["entity_id"], reason=tg(r["reason"])))
    alt = alternative_ranks(tables, site_id, region_id, objective_id)
    L.append(_("- **Comprobación con métricas alternativas** (variables estandarizadas respecto de los sitios "
               "terrestres catalogados; son relativas a ese conjunto):"))
    L.append(_("  - Distancia euclidiana ponderada: {x}.").format(x=alt["euclidean"]))
    L.append(_("  - Distancia de Mahalanobis: {x}.").format(x=alt["mahalanobis"]))
    L.append(_("  - Similitud coseno: {x}.").format(x=alt["cosine"]))
    if alt.get("out_of_range"):
        L.append(_("  - Variables excluidas de estas métricas porque la región queda fuera del rango de condiciones "
                   "terrestres (ningún sitio puede igualarlas): {items}.").format(items=", ".join(alt["out_of_range"])))
    if rank:
        L.append(_("  - Método principal (tolerancias): puesto {rank} de {n}.").format(rank=rank, n=len(all_scores)))
    L.append("")
    return "\n".join(L)


def write_top_reports(tables: dict, top_n: int = 1, objective_id: str = "balanced", lang: str = "es") -> list:
    from . import i18n
    from .similarity import rank_all
    i18n.set_lang(lang)
    scores = rank_all(tables["features"], tables["kinds"], tables["entities"], objective_id)
    config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "" if lang == "es" else f"__{lang}"
    paths = []
    for rid, grp in scores.sort_values("score", ascending=False).groupby("region_id"):
        for _i, r in grp.head(top_n).iterrows():
            path = config.REPORTS_DIR / f"{rid}__{r['site_id']}__{objective_id}{suffix}.md"
            path.write_text(build_report(tables, r["site_id"], rid, objective_id), encoding="utf-8")
            paths.append(path)
    i18n.set_lang("es")
    return paths
