import { useCallback } from "react";
import { create } from "zustand";
import { ES } from "./es";
import { IT } from "./it";

/**
 * Interface languages. English is the source and the default: `t("English text")` returns the
 * Spanish or Italian text from the dictionaries, or the English text when there is none, so a
 * missing translation never breaks the page.
 */
export type Lang = "en" | "es" | "it";

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "es", label: "Español", short: "ES" },
  { id: "it", label: "Italiano", short: "IT" },
];

const DICT: Record<Exclude<Lang, "en">, Record<string, string>> = { es: { ...ES }, it: { ...IT } };
const STORAGE_KEY = "hypatia.lang";

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "es" || v === "it") return v;
  } catch {
    // storage unavailable: English
  }
  return "en";
}

interface LangState {
  lang: Lang;
  /** Grows when translations are added at run time, so texts on screen are translated again. */
  revision: number;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  revision: 0,
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not remembered
    }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    set({ lang });
  },
}));

export type Vars = Record<string, string | number>;

/** `{name}` placeholders are filled from `vars` after translation. */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  const s = lang === "en" ? text : (DICT[lang][text] ?? text);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export type Translate = (text: string, vars?: Vars) => string;

/**
 * Marks a text for translation where it is defined, when it is translated later with `t(x)`
 * (constants, either side of a condition). It returns the text unchanged; the dictionary test
 * finds every `t("…")` and `tx("…")` in the source and checks both languages have it.
 */
export const tx = (text: string): string => text;

export function useT(): Translate {
  const lang = useLang((s) => s.lang);
  const revision = useLang((s) => s.revision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang, revision]);
}

/**
 * Adds translations found in data at run time. The engine exports its catalogue texts in
 * Spanish and English, so the Spanish of every such text is registered when its file loads and
 * `t("English text")` then works for it too. Hand-written dictionary entries are kept.
 */
export function registerTranslations(lang: Exclude<Lang, "en">, pairs: Iterable<[string, string]>) {
  let added = 0;
  for (const [en, translated] of pairs) {
    if (en && translated && !(en in DICT[lang])) {
      DICT[lang][en] = translated;
      added++;
    }
  }
  if (added) useLang.setState((s) => ({ revision: s.revision + 1 }));
}

/** Every `{ en, es }` text inside a loaded data file, as pairs for `registerTranslations`. */
export function collectSpanish(data: unknown, out: [string, string][] = []): [string, string][] {
  if (Array.isArray(data)) for (const x of data) collectSpanish(x, out);
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.en === "string" && typeof o.es === "string") out.push([o.en, o.es]);
    else for (const v of Object.values(o)) collectSpanish(v, out);
  }
  return out;
}

/** A text that comes with its own translations (the engine exports Spanish and English). */
export interface Text {
  en: string;
  es?: string;
  it?: string;
}

export function pick(lang: Lang, text: Text | null | undefined): string {
  if (!text) return "";
  if (lang === "en") return text.en;
  return text[lang] ?? translate(lang, text.en);
}

export function hasTranslation(lang: Exclude<Lang, "en">, text: string): boolean {
  return text in DICT[lang];
}
