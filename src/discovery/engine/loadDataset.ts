import { ENGINE_DATA_URL } from "../config";
import { SUPPORTED_SCHEMA, type EngineDataset } from "./types";

let pending: Promise<EngineDataset> | null = null;

/**
 * Loads the engine's data file once per session. The file is fetched at run time (not bundled),
 * so replacing it on the server is enough to publish an engine update.
 */
export function loadEngineDataset(signal?: AbortSignal): Promise<EngineDataset> {
  if (!pending) {
    pending = fetch(ENGINE_DATA_URL, { cache: "no-cache" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The engine data file could not be loaded (HTTP ${res.status}).`);
        const data = (await res.json()) as EngineDataset;
        if (data.schema !== SUPPORTED_SCHEMA) {
          throw new Error(`The engine data file has schema ${data.schema}; this version of the app reads schema ${SUPPORTED_SCHEMA}.`);
        }
        return data;
      })
      .catch((e) => {
        pending = null; // let the next call retry
        throw e;
      });
  }
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    pending!.then(resolve, reject);
  });
}

/** For tests. */
export function resetEngineDatasetCache() {
  pending = null;
}

const CMR_GRANULES = "https://cmr.earthdata.nasa.gov/search/granules.json";

/**
 * Asks NASA's Common Metadata Repository (the catalogue behind Earthdata Search) for the end
 * date of the newest granule of a collection. Used to tell the user whether NASA has published
 * data newer than the engine file includes. Resolves to null if the catalogue cannot be reached.
 */
export async function latestGranuleDate(shortName: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `${CMR_GRANULES}?short_name=${encodeURIComponent(shortName)}&sort_key=-start_date&page_size=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { feed?: { entry?: { time_end?: string; time_start?: string }[] } };
    const entry = body.feed?.entry?.[0];
    return entry?.time_end ?? entry?.time_start ?? null;
  } catch {
    return null;
  }
}
