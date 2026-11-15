"""Spanish / English interface.

Spanish is the source language of the catalogues and of the code. English text is
looked up by the Spanish string, so anything without a translation simply stays in
Spanish instead of failing.

    tr(text)      exact look-up, for interface strings and catalogue text
    tg(text)      generated text (notes, warnings, coordinate sources): exact look-up,
                  then phrase-by-phrase replacement
    tr_env(text)  names of the environment classes produced by the model

The catalogue translations in translations_en.py are keyed by identifier (site id,
parameter key...) and are matched to the Spanish strings here, so the Spanish text
never has to be retyped.
"""
from __future__ import annotations

import threading
from functools import lru_cache

from . import config

LANGS = {"es": "Español", "en": "English"}
_state = threading.local()


def set_lang(code: str) -> None:
    _state.lang = code if code in LANGS else "es"


def lang() -> str:
    return getattr(_state, "lang", "es")


def _norm(text: str) -> str:
    return " ".join(text.split())


@lru_cache(maxsize=1)
def english() -> dict[str, str]:
    """Spanish string -> English string, built from the interface dictionary and the catalogues."""
    from . import translations_en as T

    d: dict[str, str] = {_norm(k): v for k, v in T.UI.items()}

    def put(es, en) -> None:
        if isinstance(es, str) and es.strip() and isinstance(en, str) and en.strip():
            d[_norm(es)] = en

    for s in config.sites():
        e = T.SITES.get(s["id"], {})
        put(s["name"], e.get("name"))
        put(s["country"], e.get("country"))
        put(s["summary"], e.get("summary"))
        put(s["access"]["note"], e.get("access"))
        put(s.get("heritage"), e.get("heritage"))
        put(s["nasa_use"]["program"], e.get("program"))
        put(s["nasa_use"]["by"], e.get("by"))
    for r in config.regions():
        e = T.REGIONS.get(r["id"], {})
        put(r["name"], e.get("name"))
        put(r["summary"], e.get("summary"))
        put(r.get("notes"), e.get("notes"))
    params = config.parameters()
    for key, p in params["parameters"].items():
        e = T.PARAMS.get(key, {})
        put(p["label"], e.get("label"))
        put(p.get("note"), e.get("note"))
    for key, c in params["categories"].items():
        put(c["label"], T.CATEGORIES.get(key))
    for key, o in config.objectives().items():
        e = T.OBJECTIVES.get(key, {})
        put(o["label"], e.get("label"))
        put(o["description"], e.get("description"))
    consts = config.constants()
    for body, b in consts["bodies"].items():
        e = T.BODIES.get(body, {})
        put(b["label"], e.get("label"))
        put(b["atmosphere"], e.get("atmosphere"))
        put(consts["radiation"][body]["value"], e.get("radiation"))
    for body, items in consts["not_reproducible"].items():
        for item, e in zip(items, T.NOT_REPRODUCIBLE.get(body, [])):
            put(item["item"], e[0])
            put(item["why"], e[1])
    for key, items in consts["feasible_on_earth"].items():
        for item, e in zip(items, T.FEASIBLE.get(key, [])):
            put(item, e)
    links = config.load_yaml(config.CATALOG_DIR / "challenge_links.yaml")
    for link in links["links"]:
        e = T.LINKS.get(link["id"], {})
        put(link["title"], e.get("title"))
        put(link["what"], e.get("what"))
        put(link["how"], e.get("how"))
    for key, label in links.get("other_sources", {}).items():
        put(label, T.OTHER_SOURCES.get(key))
    return d


def tr(text):
    """Translate an interface or catalogue string (exact match)."""
    if lang() == "es" or not isinstance(text, str):
        return text
    return english().get(_norm(text), text)


def tg(text):
    """Translate generated text: exact match first, then known phrases in order."""
    if lang() == "es" or not isinstance(text, str):
        return text
    hit = english().get(_norm(text))
    if hit:
        return hit
    from . import translations_en as T
    for es, en in T.PHRASES:
        text = text.replace(es, en)
    return text


def tr_env(text):
    """Translate the name of an environment class (built from a small vocabulary)."""
    if lang() == "es" or not isinstance(text, str):
        return text
    from . import translations_en as T
    for es, en in T.ENVIRONMENT_WORDS:
        text = text.replace(es, en)
    return text
