import type { DiscoveryProvider } from "../DiscoveryProvider";
import { ENGINE_PROVIDER_ID, buildCandidates } from "./buildCandidates";
import { loadEngineDataset } from "./loadDataset";

/**
 * The Hypatia discovery engine. The analysis runs in Python (engine/) on NASA and Copernicus
 * data and is exported to public/engine/discovery.json; this provider reads that file and
 * answers a query from it. See docs/ENGINE.md.
 */
export const hypatiaEngineProvider: DiscoveryProvider = {
  id: ENGINE_PROVIDER_ID,
  name: "Hypatia engine (NASA data)",
  async run(query, signal) {
    const dataset = await loadEngineDataset(signal);
    return buildCandidates(dataset, query);
  },
};
