import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import qualities from "../../data/qualities.json";
import { TOURS } from "@/tour/steps";
import { ORIGIN_LABEL, TARGET_LABEL } from "@/types/site";
import type { LabDataset } from "@/lab/types";
import { ES } from "./es";
import { IT } from "./it";
import { collectSpanish, pick, registerTranslations, translate } from "./index";

const root = resolve(process.cwd(), "src");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) && !/i18n\/(es|it|index)\.ts$/.test(path) ? [path] : [];
  });
}

/** Every text the interface can show: `t("…")` / `tx("…")` in the source, plus texts kept as data. */
function interfaceTexts(): Set<string> {
  const out = new Set<string>();
  const call = /\b(?:t|tx|tr)\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of sources(root)) {
    for (const m of readFileSync(file, "utf8").matchAll(call)) out.add(JSON.parse(`"${m[1]}"`) as string);
  }
  for (const steps of Object.values(TOURS)) for (const s of steps) out.add(s.title).add(s.body);
  for (const c of qualities.categories) out.add(c.label);
  for (const q of qualities.qualities) out.add(q.label).add(q.description);
  for (const x of [...Object.values(TARGET_LABEL), ...Object.values(ORIGIN_LABEL), "strong", "moderate", "partial", "unverified", "under review", "confirmed by literature"]) out.add(x);
  const discovery = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/discovery.json"), "utf8")) as { valueMeta: Record<string, { label: string }> };
  for (const v of Object.values(discovery.valueMeta)) out.add(v.label);
  return out;
}

const lab = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/lab.json"), "utf8")) as LabDataset;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const texts = interfaceTexts();

  it("has Spanish and Italian for every interface text", () => {
    expect(texts.size).toBeGreaterThan(500);
    expect([...texts].filter((x) => !(x in ES))).toEqual([]);
    expect([...texts].filter((x) => !(x in IT))).toEqual([]);
  });

  it("keeps every placeholder in every translation", () => {
    for (const dict of [ES, IT]) for (const [en, tr] of Object.entries(dict)) expect(placeholders(tr), en).toEqual(placeholders(en));
  });

  it("has Italian for the engine's labels: regions, parameters, categories, objectives, confidence, environment types", () => {
    const labels = [
      ...lab.regions.flatMap((r) => [r.name.en, r.summary.en]),
      ...Object.values(lab.parameters).map((p) => p.label.en),
      ...Object.values(lab.categories).map((c) => c.label.en),
      ...Object.values(lab.objectives).flatMap((o) => [o.label.en, o.description.en]),
      ...lab.confidenceLevels.map((c) => c.label.en),
      ...lab.model!.clusters.map((c) => c.name.en),
    ];
    expect(labels.filter((x) => !(x in IT))).toEqual([]);
  });

  it("falls back to English, fills placeholders, and picks the language of texts that carry their own", () => {
    expect(translate("es", "Log in")).toBe("Iniciar sesión");
    expect(translate("it", "{n} matches", { n: 4 })).toBe("4 corrispondenze");
    expect(translate("es", "A text nobody translated")).toBe("A text nobody translated");
    expect(translate("en", "{n} matches", { n: 4 })).toBe("4 matches");
    const name = lab.regions.find((r) => r.id === "jezero_crater")!.name;
    expect(pick("en", name)).toBe("Jezero crater (Perseverance)");
    expect(pick("es", name)).toBe("Cráter Jezero (Perseverance)");
    expect(pick("it", name)).toBe("Cratere Jezero (Perseverance)");
    expect(pick("es", null)).toBe("");
  });

  it("learns the Spanish that the engine's data files carry", () => {
    const summary = lab.regions.find((r) => r.id === "gale_crater")!.summary;
    registerTranslations("es", collectSpanish(lab));
    expect(translate("es", summary.en)).toBe(summary.es);
  });
});
