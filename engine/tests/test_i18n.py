"""English text for the catalogues: the Hypatia export must not leave Spanish behind."""
from analogs import config, i18n


def test_every_catalogue_text_has_an_english_translation():
    en = i18n.english()
    texts = []
    for s in config.sites():
        texts += [s["name"], s["country"], s["summary"], s["access"]["note"], s["heritage"], s["nasa_use"]["program"], s["nasa_use"]["by"]]
    for r in config.regions():
        texts += [r["name"], r["summary"]] + ([r["notes"]] if r.get("notes") else [])
    for p in config.parameters()["parameters"].values():
        texts += [p["label"]] + ([p["note"]] if p.get("note") else [])
    for o in config.objectives().values():
        texts += [o["label"], o["description"]]
    for items in config.constants()["not_reproducible"].values():
        for it in items:
            texts += [it["item"], it["why"]]
    for items in config.constants()["feasible_on_earth"].values():
        texts += items
    for link in config.challenge_links():
        texts += [link["what"], link["how"]]
    missing = [t for t in texts if i18n._norm(t) not in en]
    assert not missing, missing[:5]


def test_spanish_is_untouched_and_english_is_applied():
    i18n.set_lang("es")
    assert i18n.tr("Temperatura superficial media") == "Temperatura superficial media"
    i18n.set_lang("en")
    assert i18n.tr("Temperatura superficial media") == "Mean surface temperature"
    assert i18n.tr("Texto sin traducción") == "Texto sin traducción"          # falls back, never fails
    assert i18n.tg("coordenadas de misión; verificadas dentro de 'Gale' (IAU)") == "mission coordinates; verified to lie within 'Gale' (IAU)"
    assert i18n.tr_env("frío semiárido") == "cold semi-arid"
    assert i18n.tr_env("polar hiperárido, cubierto de nieve o hielo") == "polar hyper-arid, snow- or ice-covered"


def test_generated_notes_are_fully_translated():
    i18n.set_lang("en")
    notes = [
        "Ventana 40 km, línea de base 463 m; DEM nativo 90 m; elevación respecto de geoide EGM2008; 100% de píxeles válidos",
        "Celda de reanálisis MERRA-2 (0.5x0.625°) / CERES SYN1deg (1°); corregido por elevación: sitio 4204 m, celda 2881 m (gradiente estándar 6.5 K/km y ecuación hipsométrica)",
        "Temperatura de brillo bolométrica, celda de 0.5° centrada en (0.75, 23.25); 9 celda(s) promediadas; 68/96 intervalos de hora local observados",
        "MCD_v6.2, escenario climatológico de polvo, radiación solar media; media sobre 24 longitudes solares x 24 horas locales; viento y densidad a 10 m",
        "Cero por física: sin precipitación líquida en las condiciones actuales",
    ]
    spanish_words = ("celda", "línea", "media ", "elevación", "viento", "sitio", "píxeles", "física")
    for n in notes:
        out = i18n.tg(n)
        assert not any(w in out.lower() for w in spanish_words), out
