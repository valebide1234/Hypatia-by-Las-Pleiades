import { create } from "zustand";
import { collectSpanish, registerTranslations } from "@/i18n";
import type { Target } from "@/types/site";
import { LAB_SCHEMA, type CategoryId, type LabDataset, type Place } from "./types";

/** Id of the objective whose category weights the user sets by hand. */
export const CUSTOM_OBJECTIVE = "custom";
export const DEFAULT_WEIGHTS: Record<CategoryId, number> = { geology: 30, topography: 20, environment: 25, water: 25 };

const DATA_URL = `${import.meta.env.BASE_URL}engine/lab.json`;
const PLACES_KEY = "hypatia.lab.places";

let pending: Promise<LabDataset> | null = null;

export function loadLabDataset(): Promise<LabDataset> {
  if (!pending) {
    pending = fetch(DATA_URL, { cache: "no-cache" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The Lab data file could not be loaded (HTTP ${res.status}).`);
        const data = (await res.json()) as LabDataset;
        if (data.schema !== LAB_SCHEMA) throw new Error(`The Lab data file has schema ${data.schema}; this app reads schema ${LAB_SCHEMA}.`);
        return data;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}

function readPlaces(): Place[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLACES_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Place[]).filter((p) => p && p.group === "user" && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

function writePlaces(places: Place[]) {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    // kept for this visit only
  }
}

interface LabState {
  dataset: LabDataset | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  load: () => Promise<void>;
  /** Selection shared by the Compare, Report, Machine learning and Applications tabs. */
  target: Target;
  placeId: string;
  regionId: string;
  objectiveId: string;
  select: (s: Partial<Pick<LabState, "target" | "placeId" | "regionId" | "objectiveId">>) => void;
  /** Category weights of the "custom" objective, 0–100 each (they are normalised when scoring). */
  weights: Record<CategoryId, number>;
  setWeight: (category: CategoryId, value: number) => void;
  /** New candidates opened in the Lab from the globe (this visit only). */
  candidatePlaces: Place[];
  addCandidatePlace: (place: Place) => void;
  /** Places the user added in the Lab (kept in this browser). */
  userPlaces: Place[];
  addUserPlace: (place: Place) => void;
  removeUserPlace: (id: string) => void;
}

export const useLab = create<LabState>((set, get) => ({
  dataset: null,
  status: "idle",
  error: null,
  target: "mars",
  placeId: "atacama-yungay",
  regionId: "jezero_crater",
  objectiveId: "balanced",
  userPlaces: readPlaces(),
  weights: DEFAULT_WEIGHTS,
  candidatePlaces: [],
  setWeight: (category, value) => set((cur) => ({ weights: { ...cur.weights, [category]: Math.min(100, Math.max(0, value)) } })),
  addCandidatePlace: (place) => set((cur) => ({ candidatePlaces: [...cur.candidatePlaces.filter((p) => p.id !== place.id), place] })),

  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const dataset = await loadLabDataset();
      registerTranslations("es", collectSpanish(dataset));
      set({ dataset, status: "ready" });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "The Lab data could not be loaded." });
    }
  },

  select: (s) =>
    set((cur) => {
      const next = { ...s };
      // A region belongs to one body: changing the body picks that body's first region.
      if (s.target && s.target !== cur.target && !s.regionId) {
        next.regionId = cur.dataset?.regions.find((r) => r.target === s.target)?.id ?? cur.regionId;
      }
      return next;
    }),

  addUserPlace: (place) =>
    set((cur) => {
      const userPlaces = [...cur.userPlaces.filter((p) => p.id !== place.id), place];
      writePlaces(userPlaces);
      return { userPlaces, placeId: place.id };
    }),

  removeUserPlace: (id) =>
    set((cur) => {
      const userPlaces = cur.userPlaces.filter((p) => p.id !== id);
      writePlaces(userPlaces);
      return { userPlaces, placeId: cur.placeId === id ? (cur.dataset?.places[0]?.id ?? cur.placeId) : cur.placeId };
    }),
}));

export function allPlaces(ds: LabDataset, userPlaces: Place[], candidatePlaces: Place[] = []): Place[] {
  return [...ds.places, ...candidatePlaces, ...userPlaces];
}

/**
 * The dataset with the user's own weights added as one more objective, so every tab can score
 * with it like any other. At least one weight must be positive; all-zero falls back to equal.
 */
export function withCustomObjective(ds: LabDataset, weights: Record<CategoryId, number>): LabDataset {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const categoryWeights = total > 0 ? weights : { geology: 1, topography: 1, environment: 1, water: 1 };
  return {
    ...ds,
    objectives: {
      ...ds.objectives,
      [CUSTOM_OBJECTIVE]: {
        label: { en: "Your own weights", es: "Tus propios pesos", it: "I tuoi pesi" },
        description: {
          en: "You decide how much geology, topography, environment and water count. Every parameter inside a category weighs the same.",
          es: "Vos decidís cuánto pesan la geología, la topografía, el ambiente y el agua. Dentro de cada categoría todos los parámetros pesan lo mismo.",
          it: "Decidi tu quanto contano geologia, topografia, ambiente e acqua. Dentro ogni categoria tutti i parametri pesano allo stesso modo.",
        },
        categoryWeights,
        parameterMultipliers: {},
      },
    },
  };
}
