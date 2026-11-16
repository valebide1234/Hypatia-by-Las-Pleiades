import { beforeEach, describe, expect, it } from "vitest";
import { useFilters } from "./filters";

describe("filter store", () => {
  beforeEach(() => useFilters.setState({ selected: { moon: [], mars: [] } }));

  it("toggles qualities on and off", () => {
    useFilters.getState().toggle("mars", "hyperarid");
    useFilters.getState().toggle("mars", "low_biomass");
    expect(useFilters.getState().selected.mars).toEqual(["hyperarid", "low_biomass"]);
    useFilters.getState().toggle("mars", "hyperarid");
    expect(useFilters.getState().selected.mars).toEqual(["low_biomass"]);
  });

  it("keeps selections per target", () => {
    useFilters.getState().toggle("mars", "hyperarid");
    useFilters.getState().toggle("moon", "anorthositic_rock");
    expect(useFilters.getState().selected).toEqual({ mars: ["hyperarid"], moon: ["anorthositic_rock"] });
    useFilters.getState().clear("mars");
    expect(useFilters.getState().selected).toEqual({ mars: [], moon: ["anorthositic_rock"] });
  });

  it("de-duplicates when setting a selection", () => {
    useFilters.getState().setSelected("moon", ["a", "a", "b"]);
    expect(useFilters.getState().selected.moon).toEqual(["a", "b"]);
  });
});
