import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n";
import { localAnswer, norm, type AssistantContext } from "./assistant";
import type { LabDataset } from "./types";

const ds = JSON.parse(readFileSync(resolve(process.cwd(), "public/engine/lab.json"), "utf8")) as LabDataset;
const ctx = (lang: "en" | "es" | "it" = "en"): AssistantContext => ({ ds, places: ds.places, target: "mars", objectiveId: "balanced", lang, t: (text, vars) => translate(lang, text, vars), discovery: null });

describe("Lab assistant", () => {
  it("compares a place with a region it recognises, with the engine's own score", () => {
    const a = localAnswer("Compare Haughton Crater with the Phoenix site", ctx());
    expect(a.select).toMatchObject({ placeId: "haughton-crater", regionId: "phoenix_vastitas", target: "mars" });
    expect(a.text).toMatch(/similarity \*\*0\.\d\d\*\* out of 1/);
    expect(a.text).toMatch(/does not make this one equivalent to Mars/);
  });

  it("ranks the known places for a region and picks up the objective from the question", () => {
    const a = localAnswer("Which places are most like Olympia Undae for rover mobility?", ctx());
    expect(a.select).toMatchObject({ regionId: "olympia_undae", objectiveId: "rover_mobility" });
    expect(a.text).toMatch(/1\. \*\*White Sands/);
  });

  it("understands Spanish and Italian questions and names", () => {
    expect(localAnswer("¿Qué lugares se parecen más al cráter Jezero?", ctx("es")).select).toMatchObject({ regionId: "jezero_crater" });
    expect(localAnswer("Confronta il deserto di Atacama con il cratere Gale", ctx("it")).select).toMatchObject({ placeId: "atacama-yungay", regionId: "gale_crater" });
    expect(localAnswer("lugares para la región de Artemis en la Luna", ctx("es")).select).toMatchObject({ regionId: "shackleton_south_pole", target: "moon" });
  });

  it("asks to add a place from a name or from coordinates", () => {
    expect(localAnswer("Add Salar de Atacama", ctx()).addQuery).toBe("Salar de Atacama");
    expect(localAnswer("Agrega el lugar Valle de la Luna, Chile.", ctx("es")).addQuery).toBe("Valle de la Luna, Chile");
    expect(localAnswer("-23.5, -68.2", ctx()).addQuery).toBe("-23.5, -68.2");
  });

  it("explains its sources and says what it can do when it does not understand", () => {
    expect(localAnswer("Where does the data come from? Which sources?", ctx()).text).toMatch(/NASA Earthdata Search/);
    const help = localAnswer("hello", ctx());
    expect(help.select).toBeUndefined();
    expect(help.text).toMatch(/You can ask, for example/);
  });

  it("normalises accents and punctuation", () => {
    expect(norm("¿Cráter Jezero?")).toBe("crater jezero");
  });
});
