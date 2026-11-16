import { describe, expect, it } from "vitest";
import { kindOf, parseCoordinates, summarizePower, type PowerPayload } from "./livePlace";

/** Synthetic NASA POWER response: two years of constant monthly values. */
function payload(over: Record<string, number> = {}): PowerPayload {
  const base: Record<string, number> = { TS: 10, TS_MAX: 40, TS_MIN: -20, TS_RANGE: 24, T2M: 9, PS: 90, WS10M: 4, AOD_55: 0.2, PW: 1.5, ALLSKY_SFC_SW_DWN: 6, ALLSKY_SRF_ALB: 0.3, PRECTOTCORR: 0.1, GWETTOP: 0.2, ALLSKY_SFC_UV_INDEX: 2, ...over };
  const parameter: Record<string, Record<string, number>> = {};
  for (const [name, v] of Object.entries(base)) {
    parameter[name] = {};
    for (const y of [2024, 2025]) for (let m = 1; m <= 13; m++) parameter[name]![`${y}${String(m).padStart(2, "0")}`] = v;
  }
  return { header: { fill_value: -999 }, properties: { parameter } };
}

describe("live place from NASA POWER", () => {
  it("reduces the monthly response to the engine's variables, in SI units", () => {
    const f = summarizePower(payload(), 2024, 2025);
    expect(f.tsurf_mean_K).toBeCloseTo(283.15);
    expect(f.tsurf_min_K).toBeCloseTo(253.15);
    expect(f.pressure_Pa).toBeCloseTo(90_000);
    expect(f.precip_mm_yr).toBeCloseTo(36.525);
    expect(f.insolation_Wm2).toBeCloseTo(250);
    expect(f.column_water_vapor_kgm2).toBeCloseTo(15);
    expect(f.albedo).toBeCloseTo(0.3);
    expect(f.thermal_cycling_273K).toBe(1); // 10 °C ± 12 K spans freezing every month
    expect(f.wind_dynamic_pressure_Pa).toBeCloseTo(0.5 * (90_000 / (287.05 * 282.15)) * 16, 3);
  });

  it("leaves out what NASA did not return instead of inventing it", () => {
    const f = summarizePower(payload({ ALLSKY_SRF_ALB: -999, AOD_55: -999 }), 2024, 2025);
    expect("albedo" in f).toBe(false);
    expect("dust_optical_depth" in f).toBe(false);
    expect(() => summarizePower(payload({ TS: -999 }), 2024, 2025)).toThrow(/no temperature/);
    expect(() => summarizePower({}, 2024, 2025)).toThrow(/no data/);
  });

  it("labels each value by how it was obtained", () => {
    expect(kindOf("albedo")).toBe("measured");
    expect(kindOf("tsurf_mean_K")).toBe("reanalysis");
    expect(kindOf("thermal_cycling_273K")).toBe("derived");
  });

  it("reads typed coordinates and rejects impossible ones", () => {
    expect(parseCoordinates("-24.1, -70.02")).toEqual({ lat: -24.1, lon: -70.02 });
    expect(parseCoordinates("75.38 -89.68")).toEqual({ lat: 75.38, lon: -89.68 });
    expect(parseCoordinates("95, 10")).toBeNull();
    expect(parseCoordinates("Atacama")).toBeNull();
  });
});
