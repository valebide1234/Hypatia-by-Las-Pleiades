# Hypatia engine

The analysis behind Hypatia's "Discover new analogs". It retrieves NASA and Copernicus data, compares Earth with specific lunar and Martian regions, and writes `../public/engine/discovery.json`, which the app reads.

What it does, its thresholds and its limits are described in [`../docs/ENGINE.md`](../docs/ENGINE.md).

```bash
sh scripts/update.sh                 # or `npm run engine:update` from the app folder
.venv/bin/python -m pytest -q
```

## Layout

| Path | Contents |
| --- | --- |
| `analogs/sources/` | One module per data source (NASA POWER, Copernicus DEM, LOLA/MOLA, Diviner, Mars Climate Database, TES, CMR, the IAU gazetteer), all behind a cache with a lifetime per source |
| `analogs/features.py`, `similarity.py` | Feature tables with provenance, and the weighted similarity score |
| `analogs/discovery.py` | The global land grid |
| `analogs/ml.py` | Environment types and rarity (k-means, PCA, isolation forest on the grid) |
| `analogs/hypatia_export.py` | Turns the results into Hypatia qualities, candidates and site findings |
| `analogs/pipeline.py` | Command line: `build`, `freshness`, `score`, `discover`, `train`, `export`, `all` |
| `config/` | Parameters (tolerances, transforms) and objectives (weights) |
| `data/catalog/` | Mission regions and reference sites, with citations |
| `data/processed/` | Tables written by the pipeline |
| `data/cache/` | Downloaded responses (not in git) |

The catalogues and some messages of the pipeline are written in Spanish, the language the engine was first built in; everything exported to the app is English (`analogs/i18n.py`, `translations_en.py`).

## Rules it follows

- Every value keeps its source, period and kind (measured, reanalysis, modelled, derived, literature, expert-coded).
- A value that cannot be retrieved is reported as missing, never filled in.
- A high similarity score ranks places; it is not evidence that two environments are the same.
