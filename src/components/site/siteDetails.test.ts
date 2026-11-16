import { describe, expect, it } from "vitest";
import type { AnalogSite } from "@/types/site";
import { formatCoord, limitationsFor, similaritiesFor } from "./siteDetails";

const site = {
  similarities: [
    { qualityId: "a", target: "mars", strength: "partial", explanation: "" },
    { qualityId: "b", target: "mars", strength: "strong", explanation: "" },
    { qualityId: "c", target: "moon", strength: "strong", explanation: "" },
    { qualityId: "d", target: "mars", strength: "moderate", explanation: "" },
    { qualityId: "e", target: "mars", strength: "strong", explanation: "" },
  ],
  limitations: [
    { target: "mars", explanation: "x" },
    { target: "moon", explanation: "y", qualityId: "q" },
  ],
} as unknown as AnalogSite;

describe("site detail helpers", () => {
  it("filters similarities to the target and sorts strongest first, stably", () => {
    expect(similaritiesFor(site, "mars").map((s) => s.qualityId)).toEqual(["b", "e", "d", "a"]);
    expect(similaritiesFor(site, "moon").map((s) => s.qualityId)).toEqual(["c"]);
  });

  it("filters limitations to the target", () => {
    expect(limitationsFor(site, "moon")).toHaveLength(1);
    expect(limitationsFor(site, "mars")[0]!.explanation).toBe("x");
  });

  it("formats coordinates with hemispheres", () => {
    expect(formatCoord(-24.1, -70.02)).toBe("24.100° S, 70.020° W");
    expect(formatCoord(48.88, 10.56)).toBe("48.880° N, 10.560° E");
  });
});
