"""Conversational assistant grounded on this project's NASA-derived data.

The assistant is Claude (Anthropic API) with a set of tools that read the processed
tables, run the similarity engine, query the environment model and add new places with
live NASA data. It is not a model trained from scratch on NASA data: every number it
gives comes from a tool call against the tables built by the pipeline.

Without API credentials a small rule-based helper answers the most common requests
with the same tools, so the feature never fails silently.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from . import challenge, config, custom, experiments, i18n, ml, report, similarity
from .i18n import tg, tr as _, tr_env

MODEL = "claude-opus-5-5"
MAX_TOOL_ROUNDS = 8

SYSTEM = """Eres el asistente de un sistema científico que busca lugares de la Tierra análogos a regiones \
concretas de la Luna y de Marte, usando datos reales de la NASA y de otras fuentes oficiales.

Reglas:
- Todo número, coordenada, puntuación o nombre de sitio debe salir de una herramienta. Si no lo tienes, \
llama a la herramienta; si la herramienta no lo tiene, di que no está disponible. Nunca inventes datos.
- Di de qué tipo es cada dato cuando importe (medido, reanálisis, modelado, codificado de literatura) y de \
qué página del desafío proviene si la herramienta lo indica.
- Una puntuación alta no significa que dos ambientes sean iguales: gravedad, radiación y presión no se \
reproducen en la Tierra. Recuérdalo cuando recomiendes un sitio.
- Los lugares agregados por el usuario no tienen geología verificada y su confianza es baja; dilo.
- Si el usuario pide evaluar o incluir un lugar nuevo, usa la herramienta agregar_lugar. No estimes \
coordenadas de memoria: la herramienta las obtiene de un geocodificador.
- Responde de forma breve y clara, para alguien que no es especialista. Usa listas cortas cuando compares \
varios sitios."""

LANGUAGE_RULE = {
    "es": "Responde siempre en español.",
    "en": ("Always answer in English. The tools return names and descriptions in Spanish: translate them into "
           "natural English in your answer, keeping proper names of places and missions."),
}

TOOLS = [
    {"name": "listar_regiones",
     "description": "Lista las regiones de referencia de la Luna y Marte con su identificador.",
     "input_schema": {"type": "object", "properties": {
         "cuerpo": {"type": "string", "enum": ["moon", "mars"], "description": "Filtrar por cuerpo (opcional)."}}}},
    {"name": "listar_sitios",
     "description": "Lista los sitios terrestres candidatos, indicando cuáles ya usa la NASA y con qué programa.",
     "input_schema": {"type": "object", "properties": {
         "solo_nasa": {"type": "boolean", "description": "Si es true, solo los sitios ya usados por la NASA."}}}},
    {"name": "ranking",
     "description": "Mejores análogos terrestres para una región lunar o marciana y un objetivo experimental.",
     "input_schema": {"type": "object", "properties": {
         "region_id": {"type": "string"},
         "objetivo": {"type": "string", "enum": list(config.objectives()), "description": "Por defecto: balanced."},
         "top": {"type": "integer", "description": "Cuántos sitios devolver (por defecto 5)."}},
         "required": ["region_id"]}},
    {"name": "comparar",
     "description": "Compara un sitio terrestre con una región: puntuación, categorías, parecidos y diferencias.",
     "input_schema": {"type": "object", "properties": {
         "site_id": {"type": "string"}, "region_id": {"type": "string"},
         "objetivo": {"type": "string", "enum": list(config.objectives())}},
         "required": ["site_id", "region_id"]}},
    {"name": "datos_de_lugar",
     "description": "Valores recuperados para un sitio o región, con unidad, tipo de dato y página de origen.",
     "input_schema": {"type": "object", "properties": {"entity_id": {"type": "string"}}, "required": ["entity_id"]}},
    {"name": "agregar_lugar",
     "description": ("Incluye un lugar nuevo de la Tierra: obtiene sus coordenadas (si no se dan), descarga datos "
                     "reales de la NASA para ese punto y lo compara con todas las regiones. Tarda unos segundos."),
     "input_schema": {"type": "object", "properties": {
         "nombre": {"type": "string", "description": "Nombre del lugar, p. ej. 'Desierto de Gobi'."},
         "lat": {"type": "number"}, "lon": {"type": "number"}}, "required": ["nombre"]}},
    {"name": "lugares_similares",
     "description": ("Usa los modelos entrenados con datos de la NASA para clasificar el tipo de ambiente de un lugar, "
                     "decir qué tan atípico es frente al resto de la Tierra (rareza) y hallar las zonas del planeta "
                     "con el ambiente más parecido."),
     "input_schema": {"type": "object", "properties": {"entity_id": {"type": "string"}}, "required": ["entity_id"]}},
    {"name": "fuentes_del_desafio",
     "description": "Qué páginas del desafío se usaron, cuántos valores aporta cada una y cómo.",
     "input_schema": {"type": "object", "properties": {}}},
]


# --------------------------------------------------------------------- tools
def _tables():
    from .pipeline import load_tables
    return load_tables()


def _round(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), 3)


def _top_regions(t: dict, site_id: str, n: int = 3) -> list[dict]:
    ent = t["entities"].set_index("id")
    rows = []
    for rid in ent.index[ent["body"] != "earth"]:
        r = report.pair_result(t, site_id, rid)
        rows.append({"region_id": rid, "region": ent.loc[rid, "name"], "similitud": _round(r["score"]),
                     "confianza": r["confidence_label"]})
    return sorted(rows, key=lambda x: -(x["similitud"] or 0))[:n]


def run_tool(name: str, args: dict) -> dict | list:
    t = _tables()
    ent = t["entities"].set_index("id")
    if name == "listar_regiones":
        r = ent[ent["body"] != "earth"]
        if args.get("cuerpo"):
            r = r[r["body"] == args["cuerpo"]]
        return [{"id": i, "nombre": x["name"], "cuerpo": x["body"], "descripcion": x["summary"]} for i, x in r.iterrows()]
    if name == "listar_sitios":
        s = ent[ent["body"] == "earth"]
        if args.get("solo_nasa"):
            s = s[s["nasa_used"] == True]  # noqa: E712
        return [{"id": i, "nombre": x["name"], "pais": x["country"], "usado_por_la_nasa": bool(x["nasa_used"]),
                 "programa": x["nasa_program"] if isinstance(x["nasa_program"], str) else "",
                 "origen": x["origin"]} for i, x in s.iterrows()]
    if name == "ranking":
        rid, oid = args["region_id"], args.get("objetivo", "balanced")
        if rid not in ent.index or ent.loc[rid, "body"] == "earth":
            return {"error": f"región desconocida: {rid}. Usa listar_regiones."}
        rows = []
        for sid in ent.index[ent["body"] == "earth"]:
            if sid not in t["features"].index:
                continue
            r = report.pair_result(t, sid, rid, oid)
            rows.append({"site_id": sid, "sitio": ent.loc[sid, "name"], "similitud": _round(r["score"]),
                         "confianza": r["confidence_label"], "usado_por_la_nasa": bool(ent.loc[sid, "nasa_used"]),
                         "accesibilidad_1a5": _round(ent.loc[sid, "access_score"])})
        rows.sort(key=lambda x: -(x["similitud"] or 0))
        return {"region": ent.loc[rid, "name"], "objetivo": config.objectives()[oid]["label"],
                "resultados": rows[: int(args.get("top", 5))]}
    if name == "comparar":
        sid, rid, oid = args["site_id"], args["region_id"], args.get("objetivo", "balanced")
        if sid not in t["features"].index or rid not in t["features"].index:
            return {"error": "identificador desconocido. Usa listar_sitios y listar_regiones."}
        r = report.pair_result(t, sid, rid, oid)
        ex = similarity.explain(r, top=5)
        slim = lambda rows: [{"parametro": x["label"], "tierra": _round(x["earth_value"]),
                              "destino": _round(x["target_value"]), "unidad": x["unit"],
                              "similitud": _round(x["similarity"])} for x in rows]
        body = ent.loc[rid, "body"]
        return {"sitio": ent.loc[sid, "name"], "region": ent.loc[rid, "name"], "similitud": _round(r["score"]),
                "confianza": r["confidence_label"], "cobertura": _round(r["coverage"]),
                "por_categoria": {config.parameters()["categories"][c]["label"]: _round(v)
                                  for c, v in r["category_scores"].items()},
                "lo_que_mas_acerca": slim(ex["drivers"]), "lo_que_mas_separa": slim(ex["differences"]),
                "experimentos_posibles": experiments.suggest(r["detail"])[:6],
                "no_reproducible_en_la_tierra": [i["item"] for i in experiments.not_reproducible(body)]}
    if name == "datos_de_lugar":
        eid = args["entity_id"]
        m = t["measurements"]
        m = m[(m["entity_id"] == eid) & ~m["parameter"].str.startswith("g_")]
        if m.empty:
            return {"error": f"sin datos para {eid}"}
        params = config.parameters()["parameters"]
        return {"lugar": ent.loc[eid, "name"], "lat": _round(ent.loc[eid, "lat"]), "lon": _round(ent.loc[eid, "lon"]),
                "valores": [{"parametro": params.get(r.parameter, {}).get("label", r.parameter),
                             "valor": _round(r.value), "unidad": r.unit, "tipo_de_dato": report.KIND_LABEL.get(r.kind, r.kind),
                             "pagina": r.challenge_page} for r in m.itertuples()]}
    if name == "agregar_lugar":
        try:
            entity = custom.add_place(args["nombre"], args.get("lat"), args.get("lon"))
        except Exception as exc:
            return {"error": str(exc)}
        t = _tables()
        feats = t["features"].loc[entity["id"]]
        out = {"id": entity["id"], "nombre": entity["name"], "ubicacion": entity["country"],
               "lat": _round(entity["lat"]), "lon": _round(entity["lon"]), "coordenadas_de": entity["coord_source"],
               "temperatura_media_K": _round(feats.get("tsurf_mean_K")), "precipitacion_mm_anio": _round(feats.get("precip_mm_yr")),
               "pendiente_media_grados": _round(feats.get("slope_mean_deg")), "elevacion_media_m": _round(feats.get("ctx_elevation_mean_m")),
               "regiones_mas_parecidas": _top_regions(t, entity["id"]),
               "aviso": "Geología no verificada: la comparación usa solo clima y topografía; confianza baja."}
        if ml.available():
            c = ml.classify(feats)
            out["tipo_de_ambiente"] = c["name"]
            out["rareza_0a1"] = round(c["rarity"], 2)
        return out
    if name == "lugares_similares":
        eid = args["entity_id"]
        if eid not in t["features"].index or ent.loc[eid, "body"] != "earth":
            return {"error": "solo disponible para lugares de la Tierra con datos."}
        if not ml.available():
            return {"error": "el modelo de ambientes no está entrenado (python -m analogs.pipeline train)."}
        f = t["features"].loc[eid]
        c = ml.classify(f)
        return {"lugar": ent.loc[eid, "name"], "tipo_de_ambiente": c["name"], "rareza_0a1": round(c["rarity"], 2),
                "significado_rareza": "fracción de celdas de tierra firme del planeta que son más comunes que este lugar",
                "zonas_similares": ml.similar_cells(f, 5), "modelo": ml.metadata().get("training_data", "")}
    if name == "fuentes_del_desafio":
        u = challenge.usage_by_link(t["measurements"])
        links = {l["id"]: l for l in config.challenge_links()}
        return [{"pagina": r.title, "url": r.url, "usada": r.used, "valores_guardados": r.values,
                 "como": " ".join(str(links[r.id]["how"]).split())} for r in u.itertuples()]
    return {"error": f"herramienta desconocida: {name}"}


# ----------------------------------------------------------------- Claude loop
def credentials_available(api_key: str | None = None) -> bool:
    if api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    return (Path.home() / ".config" / "anthropic").exists()


def ask_claude(history: list[dict], api_key: str | None = None) -> tuple[str, list[dict], list[dict]]:
    """Run the tool loop. Returns (answer text, updated history, tool calls made)."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
    messages = list(history)
    calls: list[dict] = []
    request = dict(model=MODEL, max_tokens=8000, system=SYSTEM + "\n- " + LANGUAGE_RULE[i18n.lang()], tools=TOOLS,
                   output_config={"effort": "medium"})

    def create(msgs):
        # Server-side fallback: if a safety classifier declines, the API retries on another model.
        try:
            return client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                                               messages=msgs, **request)
        except anthropic.BadRequestError:
            return client.messages.create(messages=msgs, **request)

    for _round in range(MAX_TOOL_ROUNDS):
        response = create(messages)
        if response.stop_reason == "refusal":
            return _("El modelo no pudo responder a esta consulta."), messages, calls
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason == "pause_turn":
            continue
        uses = [b for b in response.content if b.type == "tool_use"]
        if not uses:
            break
        results = []
        for use in uses:
            try:
                result = run_tool(use.name, dict(use.input))
                is_error = isinstance(result, dict) and "error" in result
            except Exception as exc:           # report the failure to the model instead of crashing the chat
                result, is_error = {"error": str(exc)}, True
            calls.append({"tool": use.name, "input": dict(use.input)})
            results.append({"type": "tool_result", "tool_use_id": use.id, "is_error": is_error,
                            "content": json.dumps(result, ensure_ascii=False, default=str)})
        messages.append({"role": "user", "content": results})
    text = "\n".join(b.text for b in response.content if b.type == "text").strip()
    return text or _("No obtuve una respuesta. Probá reformular la pregunta."), messages, calls


# ------------------------------------------------------------ rule-based helper
def _norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


OBJECTIVE_WORDS = {
    "water_ice_detection": ["hielo", "agua", "permafrost", "ice", "water"],
    "rover_mobility": ["rover", "movilidad", "pendiente", "mobility", "slope"],
    "astrobiology": ["astrobio", "vida", "biofirma", "life", "biosignature"], "planetary_geology": ["geolog"],
    "regolith_soil": ["regolito", "suelo", "regolith", "soil"],
    "habitat_infrastructure": ["habitat", "base", "infraestructura", "infrastructure"],
    "instrument_testing": ["instrumento", "sensor", "instrument"], "extreme_survival": ["extrem", "supervivencia", "survival"],
}
REGION_WORDS = {
    "gale_crater": ["gale", "curiosity"], "jezero_crater": ["jezero", "perseverance"],
    "meridiani_planum": ["meridiani", "opportunity"], "gusev_crater": ["gusev", "spirit"],
    "elysium_insight": ["elysium", "insight"], "phoenix_vastitas": ["phoenix", "vastitas"],
    "ares_vallis": ["ares", "pathfinder", "chryse"], "arsia_mons": ["arsia", "tharsis"],
    "melas_chasma": ["melas", "marineris"], "oxia_planum": ["oxia", "rosalind", "exomars"],
    "olympia_undae": ["olympia"], "apollo11_tranquillitatis": ["apolo 11", "apollo 11", "tranquil"],
    "apollo15_hadley": ["apolo 15", "apollo 15", "hadley"], "apollo16_descartes": ["apolo 16", "apollo 16", "descartes"],
    "apollo17_taurus_littrow": ["apolo 17", "apollo 17", "taurus", "littrow"],
    "shackleton_south_pole": ["shackleton", "polo sur", "south pole", "artemis"], "marius_hills": ["marius"],
    "aristarchus_plateau": ["aristarco", "aristarchus"], "von_karman_spa": ["karman", "aitken", "chang"],
}
HELP = ("Puedo responder, por ejemplo:\n"
        "- «mejores análogos de Gale para rovers»\n- «qué sitios usa la NASA»\n"
        "- «agregar Desierto de Gobi» (descarga datos de la NASA para ese lugar)\n"
        "- «de qué páginas salen los datos»\n\n"
        "Para conversar libremente, configure una clave de la API de Anthropic.")
ADD_WORDS = r"(agrega|agregar|anadi|anadir|inclui|incluir|evalua|evaluar|add|include|evaluate)"


def local_answer(question: str) -> str:
    """Answer common requests without a language model, using the same tools."""
    q = _norm(question)
    m = re.match(rf"\s*{ADD_WORDS}\w*\s+(el |la |los |las |the )?(.+)", q)
    if m:
        name = question.strip().split(" ", 1)[1].strip(" .?¿")
        r = run_tool("agregar_lugar", {"nombre": name})
        if "error" in r:
            return _("No pude agregar «{name}»: {error}").format(name=name, error=r["error"])
        top = "\n".join(f"- {_(x['region'])}: {x['similitud']:.2f}" for x in r["regiones_mas_parecidas"])
        env = (" " + _("Tipo de ambiente (modelo entrenado con datos NASA): **{name}**.").format(name=tr_env(r["tipo_de_ambiente"]))
               if "tipo_de_ambiente" in r else "")
        return (_("Agregué **{name}** ({place}; {lat:.2f}°, {lon:.2f}°; {source}). Temperatura media {t:.0f} K, "
                  "precipitación {p:.0f} mm/año.").format(name=r["nombre"], place=r["ubicacion"], lat=r["lat"], lon=r["lon"],
                                                         source=tg(r["coordenadas_de"]), t=r["temperatura_media_K"],
                                                         p=r["precipitacion_mm_anio"])
                + env + "\n\n" + _("Regiones más parecidas:") + f"\n{top}\n\n_{tg(r['aviso'])}_")
    if "nasa" in q and any(w in q for w in ("usa", "sitio", "cual", "lugar", "use", "site", "which", "place")):
        s = run_tool("listar_sitios", {"solo_nasa": True})
        return _("Sitios que ya usa la NASA:") + "\n" + "\n".join(f"- **{_(x['nombre'])}**: {_(x['programa'])}" for x in s)
    if any(w in q for w in ("fuente", "enlace", "link", "pagina", "de donde", "source", "page", "where")):
        s = run_tool("fuentes_del_desafio", {})
        state = {"yes": _("usada"), "partial": _("uso parcial"), "no": _("no usada")}
        return "\n".join("- **{page}** ({state}, {n} {values}): {how}".format(
            page=_(x["pagina"]), state=state[x["usada"]], n=x["valores_guardados"], values=_("valores"), how=_(x["como"])) for x in s)
    region = next((rid for rid, words in REGION_WORDS.items() if any(w in q for w in words)), None)
    if region:
        objective = next((o for o, words in OBJECTIVE_WORDS.items() if any(w in q for w in words)), "balanced")
        r = run_tool("ranking", {"region_id": region, "objetivo": objective, "top": 5})
        lines = "\n".join("{i}. **{site}** — {score:.2f} ({conf} {label})".format(
            i=i + 1, site=_(x["sitio"]), score=x["similitud"], conf=_("confianza"), label=_(x["confianza"]))
            + (" · " + _("ya usado por la NASA") if x["usado_por_la_nasa"] else "") for i, x in enumerate(r["resultados"]))
        return (_("Mejores análogos de **{region}** para «{objective}»:").format(region=_(r["region"]), objective=_(r["objetivo"]))
                + f"\n{lines}\n\n_" + _("Una puntuación alta indica cercanía en las variables comparadas, no ambientes iguales.") + "_")
    return _(HELP)
