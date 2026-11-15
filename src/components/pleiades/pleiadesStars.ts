/**
 * Bright members of the Pleiades (M45) with J2000 coordinates and V magnitudes
 * (values from the SIMBAD/Hipparcos catalogues, rounded). Used only to place the
 * procedurally drawn stars at their real relative positions; no imagery involved.
 */
export interface CatalogStar {
  name: string;
  /** Right ascension in hours (J2000). */
  raHours: number;
  /** Declination in degrees (J2000). */
  decDeg: number;
  /** Apparent visual magnitude. */
  vmag: number;
}

const ra = (h: number, m: number, s: number) => h + m / 60 + s / 3600;
const dec = (d: number, m: number, s: number) => d + m / 60 + s / 3600;

export const PLEIADES: CatalogStar[] = [
  { name: "Alcyone", raHours: ra(3, 47, 29.08), decDeg: dec(24, 6, 18.5), vmag: 2.87 },
  { name: "Atlas", raHours: ra(3, 49, 9.74), decDeg: dec(24, 3, 12.3), vmag: 3.62 },
  { name: "Electra", raHours: ra(3, 44, 52.54), decDeg: dec(24, 6, 48.0), vmag: 3.7 },
  { name: "Maia", raHours: ra(3, 45, 49.61), decDeg: dec(24, 22, 3.9), vmag: 3.87 },
  { name: "Merope", raHours: ra(3, 46, 19.57), decDeg: dec(23, 56, 54.1), vmag: 4.18 },
  { name: "Taygeta", raHours: ra(3, 45, 12.5), decDeg: dec(24, 28, 2.2), vmag: 4.3 },
  { name: "Pleione", raHours: ra(3, 49, 11.22), decDeg: dec(24, 8, 12.2), vmag: 5.05 },
  { name: "Celaeno", raHours: ra(3, 44, 48.22), decDeg: dec(24, 17, 22.1), vmag: 5.45 },
  { name: "Asterope", raHours: ra(3, 45, 54.48), decDeg: dec(24, 33, 16.2), vmag: 5.76 },
];

export interface ProjectedStar extends CatalogStar {
  /** Normalised sky-plane x in [-0.5, 0.5] across the cluster's widest extent; east is left. */
  x: number;
  /** Normalised sky-plane y; north is up (negative y), matching canvas coordinates. */
  y: number;
}

/**
 * Flat-sky (tangent-plane) projection about the cluster centroid. Over a ~1° field the
 * error versus a full gnomonic projection is far below one pixel at screen scale.
 * Output is normalised so the widest axis spans exactly 1 unit, preserving aspect ratio.
 */
export function projectCluster(stars: CatalogStar[] = PLEIADES): ProjectedStar[] {
  if (stars.length === 0) return [];
  const ra0 = stars.reduce((s, st) => s + st.raHours, 0) / stars.length;
  const dec0 = stars.reduce((s, st) => s + st.decDeg, 0) / stars.length;
  const cosDec0 = Math.cos((dec0 * Math.PI) / 180);

  const raw = stars.map((st) => ({
    // 1h of RA = 15°. East (larger RA) is drawn to the left when north is up.
    x: -(st.raHours - ra0) * 15 * cosDec0,
    y: -(st.decDeg - dec0),
  }));

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;

  return stars.map((st, i) => ({
    ...st,
    x: (raw[i]!.x - cx) / span,
    y: (raw[i]!.y - cy) / span,
  }));
}

/** Relative linear flux versus a reference magnitude (Pogson's ratio). */
export function relativeFlux(vmag: number, refMag = 2.87): number {
  return Math.pow(10, -0.4 * (vmag - refMag));
}

/** Small deterministic PRNG so the procedural sky is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
