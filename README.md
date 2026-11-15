# Hypatia: NASA terrestrial analog finder

Hypatia is a multilingual web application designed to identify, compare, and locate terrestrial environments that replicate specific conditions found on other celestial bodies, particularly Mars and the Moon.

Rather than focusing solely on visual similarities, our platform analyzes environmental and geographical variables, such as temperature, geology, mineralogy, terrain, radiation, and illumination, to identify potential locations for scientific research, experiments, and space mission simulations.

Through customizable search filters, an interactive map, and an AI-powered assistant, users can explore locations that match their research requirements. The system combines publicly available NASA scientific resources with independent research conducted by our team, allowing us to identify promising analog environments beyond those already officially recognized or studied.

Available in English, Spanish, and Italian, Hypatia aims to make the search for terrestrial analog sites more accessible to researchers, universities, students, and space exploration teams worldwide.

By transforming accessible scientific data into a practical research tool, we hope to expand opportunities for experimentation on Earth and contribute to preparing humanity for future exploration of other worlds.

**Created by Las Pléyades**, a team of girls aged 17 and 18 who have taken part in space and engineering projects such as cometa.sim, ShakthiSAT and NASA Astro Camp.

Hypatia is an independent project that uses public NASA and Copernicus data. It is not endorsed by NASA, ESA or any other agency.

> Status: **Phase 7 complete**, and the **discovery engine is connected**: it proposes new analog places and new uses for known sites from NASA data. See `docs/ENGINE.md` (what it does and how it is kept current) and `docs/DISCOVERY_INTEGRATION.md` (how it plugs in). See `hypatia_claude_code_prompt.md` for the original plan.

## Stack

React 18 + TypeScript + Vite 5 · Tailwind CSS 3 · Zustand · Supabase (auth + Postgres) · Vitest · CesiumJS (from Phase 2) · Python 3.13 for the discovery engine (`engine/`, only needed to refresh its data)

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:5173
npm test               # unit tests
npm run build          # typecheck + production build
```

The app runs without Supabase keys: accounts are disabled and only guest mode is offered.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key. Data is protected by row-level security. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only, used by `npm run seed:supabase`. Never prefix with `VITE_`. |
| `VITE_ENABLE_MOCK_DISCOVERY` | `false` by default. Set to `true` to also list the mock discovery provider (TEST DATA). |
| `VITE_ENGINE_DATA_URL` | Optional. URL of the engine's data file. Default: `public/engine/discovery.json`, shipped with the app. |
| `VITE_ASSISTANT_URL` | Optional. Address of the deployed `assistant` function, for Claude-worded answers in the Lab. |
| `VITE_BASE` | Build time only. Sub-path the app is served from (e.g. `/hypatia/` on GitHub Pages). Default `/`. |
| `VITE_CESIUM_ION_TOKEN` | Optional. Cesium ion token: enables Bing aerial imagery + Cesium World Terrain. Without it the globe uses NASA's Blue Marble (via GIBS, ~500 m/pixel, no terrain). |

### Supabase

1. Create a project, then run the SQL in `supabase/migrations/` in order (SQL editor, or `supabase db push` with the Supabase CLI):
   - `0001_profiles.sql`: profiles + auto-create trigger
   - `0002_sites_and_favourites.sql`: `analog_sites` (public read-only), `saved_searches`, `favourite_sites`, `favourite_folders`, `favourite_folder_items`, all with row-level security
2. Load the site catalogue: `npm run seed:supabase` (needs `SUPABASE_SERVICE_ROLE_KEY`; `-- --dry-run` to check without writing).
3. **Auth → URL configuration:** set the Site URL to your app origin and add `http://localhost:5173/targets` and `http://localhost:5173/auth/update-password` to the redirect URLs (the second is used by the password-reset email).
4. **Google sign-in (optional):** Auth → Providers → Google. Create an OAuth client in Google Cloud Console and add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.

## Discovery engine

`engine/` holds the analysis (Python). It retrieves NASA POWER climate (MERRA-2, CERES), Copernicus DEM terrain and the lunar and Martian archives (LOLA, MOLA, Diviner, Mars Climate Database, TES), scores Earth against 19 mission regions, and writes `public/engine/discovery.json`. The app reads that file through the discovery provider in `src/discovery/engine/`.

```bash
npm run engine:update   # re-fetch what NASA has published since the last run, re-score, export
npm run engine:test     # the engine's own tests
```

The first `engine:update` creates `engine/.venv` and installs `engine/requirements.txt`. `.github/workflows/engine-update.yml` does the same once a month and commits the new data file. Details, thresholds and limits: `docs/ENGINE.md`.

## Lab

`/lab` (the **Lab** button in the top bar) holds the engine's full analysis, in the same look as the rest of the app. Everything is computed in the browser from `public/engine/lab.json`, which the engine exports together with the discovery file.

| View | What it shows |
| --- | --- |
| Compare | Any Earth place against any of the 19 mission regions, for 9 kinds of test: overall score, confidence, the four categories, every parameter side by side with how each value was obtained, the best places for the region, and three other distance measures |
| Report | The ten-section scientific report of the selected pair, in the interface language, downloadable as Markdown |
| Machine learning | What the model is for, the map of Earth's environments (k-means, PCA, isolation forest on 877 grid cells), where the selected place and region fall, and how stable the model is |
| Applications | Experiments the pair supports, field tests that are feasible, what no place on Earth can reproduce, and the best known pair for each kind of test |
| Assistant | Questions answered from the engine's data in English, Spanish or Italian, and **Add a place**: a name or coordinates are looked up and the place's climate is requested live from NASA POWER |
| Sources and method | Every page and service used and what is taken from each, how recent the data are, what could not be retrieved, and the full method with its tolerances |
| About | The team, what Hypatia is for and what it must not be taken for |

The score is the engine's own (`engine/analogs/similarity.py`), re-implemented in `src/lab/scoring.ts` and checked against numbers the Python engine exports (`src/lab/scoring.test.ts`). Earth places are Hypatia's 27 catalogued sites plus 10 engine reference sites that are not in the catalogue yet.

**Claude (optional).** The assistant works without any key. To have Claude reword its answers in natural language, deploy `supabase/functions/assistant` (`supabase functions deploy assistant`), store the key as a Supabase secret (`supabase secrets set ANTHROPIC_API_KEY=…`) and set `VITE_ASSISTANT_URL`. Claude is given the engine's facts and told not to add to them.

## Languages

English (default), Spanish and Italian, chosen from the top bar and remembered in the browser. `t("English text")` looks the text up in `src/i18n/es.ts` and `src/i18n/it.ts` and falls back to English; a test (`src/i18n/i18n.test.ts`) fails if an interface text has no translation. Translated: the first screens, the top bar, the tour, filters and qualities, the discovery panel, the engine's findings, and the whole Lab including reports and the assistant. Not translated yet: the catalogue's long texts (site descriptions and explanations), the evidence sentences the engine writes for candidates, the favourites and saved-search panels, and, in Italian only, the Lab's application lists and source descriptions.

## Publishing

See [`docs/PUBLISHING.md`](docs/PUBLISHING.md): GitHub Pages (a workflow is included) and what the App Store would need.

## Guided tour

A tour leads a new visitor through the app, starting on the very first screen. Each page has its own short tour that starts by itself the first time the page is opened:

| Page | What the tour explains |
| --- | --- |
| First screen (`/`) | What Hypatia is for, logging in or signing up, and continuing without an account |
| Sign-in (`/auth`) | The log-in and sign-up tabs and the form (or why accounts are unavailable) |
| Target page (`/targets`) | Choosing the Moon or Mars, and the session corner |
| Globe (`/explore/…`) | The globe, the pins, a site's panel, the engine's findings, limitations, filters, the discovery panel, the Lab, favourites |
| Lab (`/lab`) | The seven views, choosing a pair, the score and its confidence, the parameter table, the language switch |

On the globe page the tour opens a site's panel and the discovery panel itself to explain what is inside them, and closes them again. Each note sits beside the element it describes, with Back, Next and **Skip tour** (which ends the tours for good). The **Tour** button replays the tour of the current page. Arrow keys move between steps and Esc skips.

The steps are plain data in `src/tour/steps.ts`; a step points at the element marked `data-tour="…"`. The overlay is `src/components/tour/Tour.tsx` and the state is `src/store/tour.ts`. What has been seen is remembered in the browser (`localStorage`, key `hypatia.tour.v1`).

## Auth and guest mode

- **Log in / Sign up:** email + password, or Google OAuth. If a valid session already exists the form is skipped.
- **Forgot password:** "Forgot password?" on the log-in tab emails a reset link (`resetPasswordForEmail`). The link opens `/auth/update-password`, where the user sets a new password. Because the app uses the PKCE flow, the link must be opened in the same browser that requested it.
- **Continue without an account:** guest state lives only in memory; reloading the page ends it. A "Guest mode, searches not saved" badge stays in the top bar.

## Landing background

The Pleiades sky is drawn procedurally on a `<canvas>`; no images are used. The nine brightest members are placed from their J2000 coordinates (Hipparcos/SIMBAD) with a flat-sky projection, sized by magnitude, and surrounded by a seeded blue reflection-nebula haze. Faint field stars twinkle and drift; `prefers-reduced-motion` renders a single static frame.

## Globe and pins

- `src/components/globe/GlobeView.tsx`: CesiumJS viewer (no Resium). Cesium's workers/assets are copied to `/cesium` by `vite-plugin-static-copy`.
- Three pin styles that differ in **shape** as well as colour (`pinImages.ts`): NASA official = circular badge, literature = slate teardrop, Hypatia candidate = amber dashed diamond. Pins cluster at low zoom; clicking a cluster zooms in, clicking a pin flies to the site and opens the side panel.
- The NASA badge PNGs (`public/assets/nasa-approved-pin-{32,48,64,128}.png`) are generated from `public/assets/nasa-approved-pin.jpg` with `npm run assets:pins` (circle detected automatically, corners made transparent).
- The legend panel also holds a keyboard-accessible list of every visible site.

## Site panel

Clicking a pin (or a site in the list) opens `src/components/site/SitePanel.tsx`. It shows:

- the origin badge, coordinates and programmes
- an Earth vs. Moon/Mars comparison with a keyboard-accessible slider or side-by-side view, and a full credit line under each image
- target-specific similarities sorted by strength (shown as text plus dots, never colour alone)
- a highlighted **Limitations** card, reachable from a header button
- research use and references (NASA, peer-reviewed, other)

Ranking details (Phase 5) and favourites (Phase 6) plug in through the `ranking` and `favourite` props. Guests who try to save get a sign-in prompt.

## Filters and ranking

The rules live in `src/lib/ranking.ts` and are tested in `src/lib/ranking.test.ts`.

- **Matching:** a site matches only if *every* selected quality is among its similarities for the current target **and** none of them is listed among its limitations. A limitation always excludes the site, even if the data also lists that quality as a similarity.
- **Score** = Σ strength weights of the selected qualities (strong 3, moderate 2, partial 1) + 1 × fidelity, where fidelity = the site's mean similarity strength for that target ÷ 3. The bonus is below 1, so it can only reorder equal strength sums.
- **Ties:** more peer-reviewed references first, then name.
- The filter bar (`src/components/filters/`) shows only the qualities relevant to the target and keeps a separate selection for the Moon and for Mars.
- With filters active, the globe shows only matching sites, each with a rank badge. The top 10 are enlarged with a glow ring, and clusters show the best rank inside them.
- The Top 10 panel lists name, score and a summary of the matches. When nothing matches, it suggests which single quality to drop.
- An "i" popover in the filter bar explains the formula. Hypatia candidates use the same ranking function.
- `QualityPicker` is reusable; the Favourites and Discovery panels will use it.

## Favourites and saved searches (signed-in users)

- **Saving:** "☆ Add to favourites" in the site panel opens a dialog where you pick folders (several allowed, or create one inline) and add a note. In the Top 10 list, ☆ saves straight to Unfiled. Saved sites show a star on their pin.
- **Favourites panel:** opened from ☆ in the top bar; it is a drawer over the globe. It has:
  - folders: create, rename, recolour/re-icon, delete (with confirmation; favourites stay and become Unfiled if they are in no other folder), and reorder (drag, or ↑/↓)
  - "All favourites" and "Unfiled" views
  - drag-and-drop onto a folder (move; hold Alt/Option to copy), plus a keyboard-accessible "Move to… / Copy to" menu
  - text search, filters by target, pin type, qualities (same matching rules as the globe), and country
  - sorting by date saved, name, ranking score for the current globe filters, or distance from the globe view
  - "Show on globe", and Undo after removing
- **Saved searches:** "Saved searches ▾" in the filter bar saves the target and qualities with a timestamp and reloads them later. Guests see a sign-in prompt.
- **Code:** `src/lib/favourites.ts` holds the pure state, filter and sort logic (tested in `favourites.test.ts`). `src/store/userData.ts` applies changes optimistically through a `UserDataRepo`: `src/data/repo/supabaseRepo.ts` in production, protected by RLS, and `localRepo.ts` for development.
- **Local demo account (development only):** when Supabase is not configured, the sign-in page offers "Use local demo account". It stores favourites in `localStorage` so the signed-in features can be tried without a backend. It is not available in production builds.

## Discovery module

"Discover new analogs" in the filter bar opens a panel that reuses the quality picker, lets the user choose a mission region (for example the Artemis south-pole region or Jezero crater), and runs a registered `DiscoveryProvider` (`src/discovery/`). The default provider is the Hypatia engine. The panel shows how recent the engine's data are and whether NASA has published newer data since.

Provider results are validated, then shown as amber Hypatia-candidate pins. They:
- are ranked by the same `rankSites` function as known sites
- open the side panel with an "unverified" warning, the provider's confidence and the values the engine retrieved
- can be saved to favourites

The panel also lists **known sites with new reasons**: catalogued sites where the data support a quality the catalogue does not list. The same findings appear in each site's panel, next to the catalogue entries the data support. They are suggestions and never change a site's rank.

A mock provider that returns three synthetic candidates labelled **TEST DATA** remains for checking the pipeline; it is listed only when `VITE_ENABLE_MOCK_DISCOVERY=true`. Contract and data flow: [`docs/DISCOVERY_INTEGRATION.md`](docs/DISCOVERY_INTEGRATION.md).

## Data

- `data/qualities.json`: the 26 filterable qualities in three categories (geology, environment, operational), each with the targets it applies to and a scientific justification. Edit this file to add qualities.
- `data/sites.json`: versioned seed dataset of **27 sites** (20 official NASA analogs, 7 literature or other-agency analogs). Each site has target-specific similarities (with strength), limitations, research use, references and paired images. The app bundles this file, so it works without Supabase; `npm run seed:supabase` mirrors it into the `analog_sites` table.
- A site is marked `nasa_official` only when a NASA source (nasa.gov, NTRS, NASA Science, JPL or NASA Astrobiology) documents NASA analog field work, crew training or instrument testing there. That source is cited in the site's references.
- All DOIs were resolved against Crossref and all reference URLs checked for an HTTP 200/302 response (November 2026).
- `src/data/sites.test.ts` enforces the data rules: quality ids exist and apply to the target, no quality is both a similarity and a limitation for the same target, NASA sites cite NASA, and every image has full provenance and a local file.

## Data sources and image licensing

- Every image is a real photograph or remote-sensing product (Apollo Hasselblad, LROC, HiRISE, rover cameras, Landsat, ISS, field photos). There are no AI-generated, AI-upscaled or artist's images. All are downloaded into `public/images/` (resized; some panoramas cropped), never hot-linked.
- Licences: public domain (NASA/USGS/BLM), CC0, CC BY and CC BY-SA. The full per-image list with credit, licence and original URL is in [`docs/IMAGE_CREDITS.md`](docs/IMAGE_CREDITS.md) (regenerate with `npm run docs:credits`). CC BY-SA images keep that licence when redistributed.
- Pairings without a verified image are logged in [`MISSING_IMAGES.md`](MISSING_IMAGES.md) and shown as "Real image pending".
- Target-selection cards: Apollo 11 AS11-44-6667 (NASA, public domain) and the Viking 1 Valles Marineris mosaic (NASA/USGS, public domain).
- Globe fallback imagery: Blue Marble shaded relief & bathymetry, NASA Earth Observatory via NASA EOSDIS GIBS (public domain).
