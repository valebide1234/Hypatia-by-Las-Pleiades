# Discovery module: integration guide

The discovery module is the slot where discovery engines plug in. An engine compares datasets and proposes **new analog sites that no space agency has catalogued yet**. This document describes the contract a provider must implement and how its results flow through the app.

The **Hypatia engine is connected** through this contract: see `docs/ENGINE.md` for what it does. A mock provider that returns synthetic **TEST DATA** is still available for checking the pipeline; it is listed only when `VITE_ENABLE_MOCK_DISCOVERY=true`.

## Files

| File | Role |
| --- | --- |
| `src/discovery/DiscoveryProvider.ts` | `DiscoveryQuery` and `DiscoveryProvider` interfaces (the contract) |
| `src/discovery/registry.ts` | List of installed providers (the Hypatia engine first) |
| `src/discovery/engine/` | The Hypatia engine's provider: loads `public/engine/discovery.json` and answers queries from it |
| `src/discovery/config.ts` | `ENABLE_MOCK_DISCOVERY` (lists the mock provider) and `ENGINE_DATA_URL` |
| `src/store/engine.ts` | The engine's dataset for the panels, and the live check of NASA's newest data |
| `src/discovery/mockProvider.ts` | Mock provider (TEST DATA) |
| `src/discovery/validateCandidate.ts` | Validation applied to every provider result before display |
| `src/store/discovery.ts` | Runs providers, stores validated candidates for the session |
| `src/data/siteRegistry.ts` | `useAllSites()` / `findSite()`: catalogue + candidates, used by the globe, ranking, side panel and favourites |
| `src/components/discovery/DiscoverPanel.tsx` | "Discover new analogs" panel (reuses `QualityPicker`) |
| `src/discovery/discovery.test.ts` | Pipeline tests |

## The contract

```ts
interface DiscoveryQuery {
  target: "moon" | "mars";
  qualityIds: string[];          // ids from data/qualities.json
  region?: GeoJSON.Polygon;      // optional search area, WGS84 lon/lat (RFC 7946)
  missionRegionId?: string;      // optional mission need: a lunar or Martian region to match
  preferNewData?: boolean;       // put first the places the newest data strengthen
}

interface DiscoveryProvider {
  id: string;                    // stable; becomes discovery.providerId
  name: string;                  // shown in the panel
  isTestData?: boolean;          // true only for synthetic providers
  run(query: DiscoveryQuery, signal?: AbortSignal): Promise<AnalogSite[]>;
}
```

`run` resolves to ordinary `AnalogSite` objects (see `src/types/site.ts`) with these requirements. Each one is enforced by `validateCandidates`, and a candidate that breaks any of them is **dropped and reported**, never corrected silently.

| Requirement | Why |
| --- | --- |
| `origin: "hypatia_candidate"` | Amber diamond pin and "Hypatia candidate" badge; never confused with recognised sites |
| `discovery` present, with `providerId === provider.id` | Provenance |
| `discovery.confidence` in [0, 1] | Shown as a percentage in the side panel and Discover panel |
| `discovery.status` ∈ `unverified` \| `under_review` \| `confirmed_by_literature` | Shown in the warning box |
| `id` unique and not colliding with a catalogued site | Favourites and selection are keyed by id. Use a provider prefix, e.g. `hypatia-engine:<hash>` |
| `targets` includes `query.target` | The result must answer the question asked |
| valid `lat`/`lon` | Globe placement |
| every `qualityId` in similarities and limitations exists in `data/qualities.json` | Matching and labels |

`DiscoveryMeta` (from `src/types/site.ts`):

```ts
interface DiscoveryMeta {
  providerId: string;
  runAt: string;                 // ISO timestamp
  confidence: number;            // 0–1, the provider's own estimate (not a validation)
  datasetsUsed: string[];        // e.g. ["MOLA", "HiRISE DTM", "Landsat 9 OLI", "SoilGrids"]
  method: string;                // free text: how the match was computed
  status: "unverified" | "under_review" | "confirmed_by_literature";
}
```

### What a good candidate looks like

- **Similarities:** one entry per quality the engine thinks the site shares, with a `strength` and an `explanation` that names the evidence ("Mean annual precipitation < 2 mm, ERA5 1991–2020").
- **Limitations:** the engine should report qualities it checked that the site **fails**, using `qualityId`. Limitations always exclude a site from a filter on that quality, for candidates exactly as for known sites. Always add at least the generic limitations (atmosphere, gravity, biology) that apply.
- **Images:** real imagery only (see the imagery rules in the main prompt). Leave `images` empty if none is verified; the panel then shows "Real image pending".
- **References:** may be empty. The panel says the candidate has not been confirmed by any published study.

## How results flow

1. The user opens **Discover new analogs** (filter bar), picks qualities with the shared `QualityPicker` (pre-filled from the globe filters), optionally a mission region, then presses **Run discovery**.
2. `useDiscovery.run(provider, query)` calls `provider.run`, validates the output, and **replaces** that provider's previous candidates for the same target. Other providers' and other targets' candidates are kept. A new run aborts an in-flight one through the `AbortSignal`.
3. `useAllSites()` merges the candidates with the catalogue, so they:
   - appear as **amber diamond pins** (shape and colour differ from known sites)
   - take part in **`rankSites`**, the same function and weights as known sites, and can enter the top 10 while keeping their colour
   - open the **side panel** with the "Hypatia candidate, unverified" warning, confidence, method and datasets
   - can be **saved to favourites** and filed into folders
4. Optionally, the run's qualities are applied to the globe ranking. With the Hypatia engine only the qualities it can measure are applied, because its candidates never claim the others.

## Adding another provider

The Hypatia engine (`src/discovery/engine/engineProvider.ts`) reads a data file that the Python engine exports ahead of time. A provider can also be a thin client of an HTTP API:

1. Implement `DiscoveryProvider`, for example:

   ```ts
   export const hypatiaEngineProvider: DiscoveryProvider = {
     id: "my-engine",
     name: "My discovery engine",
     async run(query, signal) {
       const res = await fetch(`${import.meta.env.VITE_DISCOVERY_API}/discover`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(query),
         signal,
       });
       if (!res.ok) throw new Error(`Discovery failed (${res.status})`);
       return (await res.json()) as AnalogSite[];
     },
   };
   ```

2. Add it to the array in `src/discovery/registry.ts`.
3. Run `npm test`. The tests in `src/discovery/discovery.test.ts` describe the expected behaviour; add provider-specific tests next to them.

## Known gaps and follow-ups

- **Search area:** `region` (a polygon drawn on the globe) is in the contract but no provider uses it yet, and the panel has no control for it.
- **Persistence:** candidates live in memory for the session. The Hypatia engine returns deterministic ids (`hypatia-engine:<grid cell>:<target>`), so the same run reproduces the same candidates. A favourite that points at a candidate keeps working after a reload only once that candidate is produced again by a run with the same id. Otherwise the Favourites panel shows "This site is no longer in the catalogue". For durable candidates, either:
  - store a snapshot in a `discovery_candidates` table, which would need a schema change; ask before doing it, or
  - make the engine return stable, deterministic ids.
- **Review workflow:** `status` changes (`under_review`, `confirmed_by_literature`) are display-only today; there is no curation UI.
- **Imagery:** the engine should return verified real imagery with full metadata, or none.
