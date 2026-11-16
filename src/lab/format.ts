import { tx, type Translate } from "@/i18n";
import type { ValueKind } from "./types";

/** Unit as shown: the engine's catalogue writes some units in Spanish and marks unitless values. */
export function unitLabel(unit: string): string {
  if (unit === "grados") return "°";
  if (unit === "mm/año") return "mm/yr";
  if (unit === "W/m2") return "W/m²";
  if (unit === "kg/m2") return "kg/m²";
  if (unit === "-" || unit === "0-1" || unit === "0/0.5/1") return "";
  return unit;
}

/** How a value was obtained, in words. The English text is the dictionary key. */
export const KIND_LABEL: Record<ValueKind, string> = {
  measured: tx("Measured"),
  reanalysis: tx("Reanalysis"),
  modeled: tx("Modelled"),
  derived: tx("Derived"),
  literature: tx("Literature"),
  expert_coded: tx("Coded from literature"),
  physical_zero: tx("Zero by physics"),
};

export const KIND_HELP: Record<ValueKind, string> = {
  measured: tx("Satellite or in-situ measurement retrieved from an archive"),
  reanalysis: tx("MERRA-2 reanalysis: a model constrained by observations"),
  modeled: tx("Output of a climate model (Mars Climate Database) or an astronomical computation"),
  derived: tx("Computed here from other retrieved values"),
  literature: tx("Published value entered with its citation"),
  expert_coded: tx("Ordinal descriptor (absent, present, dominant) coded from the cited literature, not a measurement"),
  physical_zero: tx("Zero imposed by physics, for example rainfall on the Moon"),
};

const WORDS = { dominant: tx("dominant"), present: tx("present"), absent: tx("absent") };

/** Display value: ordinal descriptors as words, numbers with sensible precision. */
export function showValue(t: Translate, value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "0/0.5/1") return t(value >= 1 ? WORDS.dominant : value >= 0.5 ? WORDS.present : WORDS.absent);
  const a = Math.abs(value);
  if (a !== 0 && a < 0.001) return value.toExponential(1);
  if (a >= 1000) return Math.round(value).toLocaleString("en-US");
  if (a >= 100) return value.toFixed(0);
  if (a >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function coord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
