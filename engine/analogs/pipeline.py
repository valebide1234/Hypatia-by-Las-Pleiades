"""Command-line pipeline.

    python -m analogs.pipeline build       retrieve data and build the feature tables
    python -m analogs.pipeline score       rank Earth sites for every region and objective
    python -m analogs.pipeline discover    scan a global land grid for new candidates
    python -m analogs.pipeline train       fit the environment model on the NASA-derived grid
    python -m analogs.pipeline reports     write scientific reports for the best matches
    python -m analogs.pipeline freshness   report how recent the upstream datasets are
    python -m analogs.pipeline evidence    prove which pages of the challenge were used (live checks)
    python -m analogs.pipeline export      write public/engine/discovery.json for the Hypatia app
    python -m analogs.pipeline all         everything above, in order

Add --refresh to ignore the cache and download every product again.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import pandas as pd

from . import __version__, config, features
from .provenance import utc_now
from .sources import http


def _save(df: pd.DataFrame, name: str) -> None:
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED_DIR / name, index=False)


def load_tables() -> dict[str, pd.DataFrame]:
    """Processed tables as used by scoring, reports and the dashboard."""
    p = config.PROCESSED_DIR
    if not (p / "measurements.csv").exists():
        raise FileNotFoundError("No hay datos procesados. Ejecute primero: python -m analogs.pipeline build")
    m = pd.read_csv(p / "measurements.csv", keep_default_na=True)
    ent = pd.read_csv(p / "entities.csv")
    # Places added by the user or by the assistant live in their own files.
    if (p / "custom_measurements.csv").exists():
        m = pd.concat([m, pd.read_csv(p / "custom_measurements.csv")], ignore_index=True)
        ent = pd.concat([ent, pd.read_csv(p / "custom_entities.csv")], ignore_index=True)
    from .challenge import page_label
    m["challenge_page"] = m["source"].map(page_label)
    out = {"measurements": m, "entities": ent,
           "features": features.wide(m, "value"),
           "kinds": m.pivot_table(index="entity_id", columns="parameter", values="kind", aggfunc="first"),
           "pages": m.pivot_table(index="entity_id", columns="parameter", values="challenge_page", aggfunc="first"),
           "missing": pd.read_csv(p / "missing.csv") if (p / "missing.csv").exists() else pd.DataFrame()}
    for extra in ("discovery_cells.csv", "discovery_rankings.csv", "earthdata_inventory.csv",
                  "worldview_snapshots.csv", "copernicus_scenes.csv"):
        if (p / extra).exists():
            out[extra.split(".")[0]] = pd.read_csv(p / extra)
    return out


def cmd_build(args) -> None:
    problems = config.validate_catalogs()
    if problems:
        sys.exit("Errores en los catálogos:\n  " + "\n  ".join(problems))
    t0 = time.time()
    print("Recuperando datos (NASA POWER, Copernicus DEM, LOLA, MOLA, Diviner, TES, MCD)...")
    result = features.build_all(max_workers=args.workers)
    _save(result["measurements"], "measurements.csv")
    _save(result["missing"], "missing.csv")
    _save(result["entities"], "entities.csv")
    meta = {
        "version": __version__, "built_at": utc_now(), "elapsed_s": round(time.time() - t0, 1),
        "window_km": 2 * config.WINDOW_HALF_M / 1000, "baseline_m": config.BASELINE_M,
        "earth_climate_years": config.EARTH_CLIMATE_YEARS,
        "n_measurements": int(len(result["measurements"])), "n_missing": int(len(result["missing"])),
        "warnings": result["warnings"],
    }
    (config.PROCESSED_DIR / "run_metadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"Listo: {meta['n_measurements']} valores, {meta['n_missing']} faltantes, {meta['elapsed_s']} s")
    for w in result["warnings"]:
        print("  AVISO:", w)


def cmd_score(args) -> None:
    from . import similarity
    t = load_tables()
    frames = [similarity.rank_all(t["features"], t["kinds"], t["entities"], oid) for oid in config.objectives()]
    scores = pd.concat(frames, ignore_index=True)
    _save(scores, "scores.csv")
    best = scores[scores["objective"] == "balanced"].sort_values("score", ascending=False).groupby("region_id").head(3)
    names = t["entities"].set_index("id")["name"]
    print("Mejores análogos por región (objetivo equilibrado):")
    for rid, grp in best.groupby("region_id", sort=False):
        print(f"  {names[rid]}")
        for _, r in grp.iterrows():
            print(f"     {r['score']:.2f}  conf. {r['confidence_label']:<5}  {names[r['site_id']]}")


def cmd_discover(args) -> None:
    from . import discovery
    t = load_tables()
    cells, rankings = discovery.run(t, step_deg=args.step, top_n=args.top, workers=args.workers)
    _save(cells, "discovery_cells.csv")
    _save(rankings, "discovery_rankings.csv")
    print(f"Descubrimiento: {len(cells)} celdas de tierra firme evaluadas, {len(rankings)} coincidencias guardadas")


def cmd_reports(args) -> None:
    from . import report
    t = load_tables()
    paths = report.write_top_reports(t, top_n=args.top, objective_id=args.objective, lang=args.lang)
    print(f"{len(paths)} informes escritos en {config.REPORTS_DIR}")


def cmd_freshness(args) -> None:
    from .sources import cmr
    rep = cmr.freshness_report()
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (config.PROCESSED_DIR / "freshness.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False))
    for c in rep["earth_collections"]:
        print(f"  {c.get('short_name'):<12} último gránulo: {c.get('latest_granule_end') or c.get('latest_granule_start') or c.get('error')}")
    for a in rep["planetary_archives"]:
        print(f"  {a['label']:<45} modificado: {a.get('last_modified') or a.get('error')}")


def cmd_train(args) -> None:
    from . import ml
    t = load_tables()
    if "discovery_cells" not in t:
        sys.exit("Ejecute primero: python -m analogs.pipeline discover")
    meta = ml.train(t["discovery_cells"])
    print(f"Modelo de ambientes entrenado con {meta['n_cells']} celdas de datos NASA POWER "
          f"(silueta {meta['silhouette']}):")
    for c in meta["clusters"]:
        print(f"  {c['cells']:>4} celdas  {c['name']}  (rareza media {c['rarity']:.2f})")
    ev = meta["pca"]["explained_variance"]
    print(f"PCA: los dos componentes explican {ev[0]:.0%} y {ev[1]:.0%} de la variación entre ambientes.")
    for i, comp in enumerate(meta["pca"]["loadings"], 1):
        print(f"  componente {i}: " + ", ".join(f"{x['feature']} ({x['loading']:+.2f})" for x in comp))
    st = meta["stability"]
    print(f"Estabilidad al reentrenar con otras semillas: grupos ARI {st['kmeans_ari']:.2f} "
          f"(mínimo {st['kmeans_ari_min']:.2f}); rareza, correlación de rangos {st['forest_spearman']:.2f}.")


def cmd_evidence(args) -> None:
    from . import challenge
    ev = challenge.build_evidence(load_tables())
    for lid, e in ev["links"].items():
        print(f"  {e['title']:<52} usado: {e['used']:<8} valores: {e['values']}")


def cmd_export(args) -> None:
    from . import hypatia_export
    t = load_tables()
    if "discovery_cells" not in t:
        sys.exit("Run first: python -m analogs.pipeline discover")
    path = hypatia_export.write(t)
    print(f"Hypatia data file written: {path} ({path.stat().st_size / 1024:.0f} kB)")
    from . import lab_export
    path = lab_export.write(t)
    print(f"Lab data file written: {path} ({path.stat().st_size / 1024:.0f} kB)")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="analogs", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["build", "score", "discover", "train", "reports", "freshness", "evidence", "export", "all"])
    ap.add_argument("--refresh", action="store_true", help="ignorar la caché y descargar de nuevo")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--step", type=float, default=5.0, help="paso de la grilla global de descubrimiento (grados)")
    ap.add_argument("--top", type=int, default=10, help="número de mejores resultados por región")
    ap.add_argument("--objective", default="balanced", choices=list(config.objectives()))
    ap.add_argument("--lang", default="es", choices=["es", "en"], help="idioma de los informes")
    args = ap.parse_args(argv)
    if args.refresh:
        http.set_refresh(True)
    steps = {"build": cmd_build, "score": cmd_score, "discover": cmd_discover,
             "reports": cmd_reports, "freshness": cmd_freshness, "evidence": cmd_evidence, "train": cmd_train,
             "export": cmd_export}
    # `all` is the periodic update run for Hypatia: retrieve, score, scan the grid, export.
    for name in (["build", "freshness", "score", "discover", "train", "export"] if args.command == "all" else [args.command]):
        print(f"\n== {name} ==")
        steps[name](args)


if __name__ == "__main__":
    main()
