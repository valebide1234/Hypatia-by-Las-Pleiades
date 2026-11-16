# The Hypatia discovery engine

The engine is the part of Hypatia that proposes analogs nobody has catalogued. It answers two questions with data that NASA and Copernicus publish and keep updating:

1. **Where on Earth is there a place, not in any analog catalogue, whose measured conditions match what a mission needs?** These are the amber *Hypatia candidate* pins.
2. **Which known analog sites could be used for a reason nobody lists?** These appear as *Known sites, new reasons* in the Discover panel and in each site's panel.

It is tied to mission needs: a search can be aimed at one of 19 regions where Artemis and the Mars missions operate or plan to (the Artemis south-pole region at Shackleton, the Apollo sites, Jezero, Gale, Oxia Planum and others).

## How it fits in the app

```
engine/ (Python)                              src/ (the app)
  NASA POWER, Copernicus DEM,                   src/discovery/engine/
  LOLA, MOLA, Diviner, MCD, TES                   loadDataset.ts      fetches the file
        │                                         buildCandidates.ts  answers a query from it
        ▼                                         engineProvider.ts   the DiscoveryProvider
  python -m analogs.pipeline all                src/store/engine.ts
        │                                       src/components/discovery/
        ▼                                         DiscoverPanel.tsx, EngineStatus.tsx,
  public/engine/discovery.json  ───────────▶      EngineFindings.tsx (inside the site panel)
```

The analysis runs ahead of time in Python and is exported to one JSON file. The app fetches that file at run time, so publishing an engine update means replacing the file; the app does not need rebuilding. `VITE_ENGINE_DATA_URL` can point at a hosted copy.

The engine also writes `public/engine/lab.json` for the **Lab** page (`/lab`): the feature tables of every Earth place and mission region with the kind and source of each value, the parameters and objectives, the environment model, the applications and limits, and the list of sources. The Lab re-implements the scoring in the browser (`src/lab/scoring.ts`); the file carries a few pairs scored by the Python engine, and a test checks the two agree.

## Keeping it current

- `npm run engine:update` re-runs the engine. Each source has a cache lifetime (NASA POWER: 30 days), after which it is asked again, so a run picks up whatever NASA has published since the last one.
- `.github/workflows/engine-update.yml` does this monthly and commits the new file.
- Climate statistics use the latest 10 **complete** calendar years, so they shift once a year. The *newest data* comparison uses the latest 36 **published months** against the 84 before them, so it moves every month.
- The Discover panel shows the newest month the file includes. It also asks NASA's catalogue (CMR, the service behind Earthdata Search) for the newest MERRA-2 month and says whether the file already includes it.

## What it retrieves

| Data | Source | Kind |
| --- | --- | --- |
| Surface temperature, pressure, wind, precipitation, soil wetness, aerosol optical depth | NASA POWER (MERRA-2 reanalysis, 0.5°×0.625°) | Reanalysis |
| Albedo, sunlight at the surface, UV index | NASA POWER (CERES SYN1deg, 1°) | Measured (satellite product) |
| Slope, relief, roughness on Earth | Copernicus DEM GLO-90, resampled to a 463 m baseline over a 40 km window | Measured |
| Lunar terrain and temperature | LRO LOLA LDEM_64, LRO Diviner GCP | Measured |
| Martian terrain | MGS MOLA MEGDR | Measured |
| Martian climate | Mars Climate Database v6.2 | Modelled |
| Martian albedo and thermal inertia | MGS TES | Measured |

Every value shown in the app carries its kind: **measured**, **reanalysis**, **derived** (computed from retrieved values, e.g. an elevation correction) or **inferred** (a conclusion drawn from them).

## How a place becomes a candidate

1. Earth's land is sampled on a 5° grid (877 cells). Each cell gets the climate values above; cells that can be bare ground (not an ice sheet, not a humid climate) also get terrain.
2. Cells within 300 km of a known analog (Hypatia's catalogue plus the engine's own reference list) are dropped: they are not new places.
3. Each remaining cell is given the Hypatia qualities its values support, with the fixed thresholds below.
4. Each cell with terrain is scored against every mission region with the engine's weighted per-parameter similarity, `s = exp(−d²/2)`, grouped into terrain, environment and water.
5. For a query, the app keeps the cells that support every requested quality the engine can measure, orders them (strength of the requested qualities, similarity to the chosen mission region, optionally the newest-data signal), keeps them at least 900 km apart, and returns the best eight.

### Thresholds

| Quality | Value | Strong | Moderate | Partial | Reported as a limitation |
| --- | --- | --- | --- | --- | --- |
| Hyperarid | Mean precipitation | < 25 mm/yr | < 50 | < 100 | > 250 mm/yr |
| Extreme cold | Mean surface temperature | < −30 °C | < −15 °C | < −5 °C | > +5 °C |
| Permafrost & ground ice | Mean surface temperature (inferred) | never | < −8 °C | < −2 °C | > +5 °C |
| High altitude / low pressure | Mean surface pressure | < 60 kPa | < 70 kPa | < 80 kPa | > 95 kPa |
| High UV exposure | All-sky UV index, daily mean | ≥ 2.5 | ≥ 2.3 | ≥ 2.1 | < 1.0 |
| Rover & EVA traversal testing | Terrain similarity to a mission region (inferred), only where precipitation is under 300 mm/yr | never | ≥ 85% | ≥ 65% | not reported |

They are defined in `engine/analogs/hypatia_export.py` (`RULES`, `TERRAIN_RULE`) and exported with the data. Inferred qualities are never "strong". A quality met only in the newest 36 months is "partial" and says so.

### New uses for known sites

Every catalogued site is measured at its own coordinates with the same data (with an elevation correction when the site and the reanalysis cell differ by more than 300 m). For each quality the engine can measure:

- the catalogue lists it and the data support it: shown as **supported by the data**;
- the catalogue does not list it, does not rule it out, and the data support it: shown as a **new reason**;
- the catalogue lists it and the grid-cell value clearly does not meet the threshold: shown as a **data check**, with the reminder that the cell is about 50 km wide.

These are suggestions shown next to the catalogue. They never change a site's catalogued similarities or its rank.

## What it cannot say

- **No geology.** The engine retrieves no global rock, mineral or landform data, so it never claims basalt, sulfates, craters, dunes or any other geological quality. Every candidate carries this as a limitation.
- **Coarse scale.** Climate describes a grid cell about 50 km wide; terrain a 40 km window at a 463 m baseline. A candidate is a search area, not a site, and says nothing about rocks or soil at rover scale.
- **The grid is 5°.** Small places between grid points are not sampled. A finer grid is a parameter (`--step`) and costs proportionally more requests.
- **Short windows vary.** A match that appears only in the newest three years can be natural variability; the text says so.
- **A similarity score ranks places.** It does not make a place equivalent to the Moon or Mars. Gravity, atmosphere, radiation and biology always differ, and each candidate lists that.
- **Moon searches are narrow.** Hypatia's lunar qualities are geological or operational, so the only lunar quality the engine can support is traverse rehearsal, from terrain.

## Running it

```bash
npm run engine:update            # everything; creates engine/.venv on the first run
cd engine
.venv/bin/python -m analogs.pipeline export     # only rewrite the data file from processed tables
.venv/bin/python -m analogs.pipeline discover --step 2.5   # finer grid (about 4× the requests)
.venv/bin/python -m pytest -q
```

Steps of `all`: `build` (retrieve and build the feature tables), `freshness` (newest granule of each NASA collection, from CMR), `score`, `discover` (the grid), `train` (environment types and rarity), `export`.
