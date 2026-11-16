import { beforeEach, describe, expect, it } from "vitest";
import { TOURS, tourForPath } from "@/tour/steps";
import { useTour } from "./tour";

const st = () => useTour.getState();

beforeEach(() => {
  localStorage.clear();
  useTour.setState({ active: null, index: 0, seen: [] });
});

describe("guided tour", () => {
  it("starts by itself only the first time a page is visited", () => {
    st().startIfFirstVisit("targets");
    expect(st().active).toBe("targets");
    for (let i = 0; i < TOURS.targets.length; i++) st().next();
    expect(st().active).toBeNull();
    expect(st().seen).toEqual(["targets"]);
    st().startIfFirstVisit("targets");
    expect(st().active).toBeNull();
    // The other page's tour is still offered, and the Tour button can replay any of them.
    st().startIfFirstVisit("explore");
    expect(st().active).toBe("explore");
    st().stop();
    st().start("targets");
    expect(st().active).toBe("targets");
  });

  it("Skip ends the tour and stops every tour from starting by itself again", () => {
    st().startIfFirstVisit("targets");
    st().skip();
    expect(st().active).toBeNull();
    st().startIfFirstVisit("explore");
    expect(st().active).toBeNull();
    expect(JSON.parse(localStorage.getItem("hypatia.tour.v1")!)).toEqual(Object.keys(TOURS));
  });

  it("moves forward and back without leaving the first step", () => {
    st().start("explore");
    st().back();
    expect(st().index).toBe(0);
    st().next();
    st().next();
    st().back();
    expect(st().index).toBe(1);
  });

  it("does not interrupt a tour that is already running", () => {
    st().start("targets");
    st().next();
    st().startIfFirstVisit("explore");
    expect(st()).toMatchObject({ active: "targets", index: 1 });
  });

  it("passes over optional steps whose element is not on the page, in both directions", () => {
    const formIsMissing = (step: { target?: string }) => step.target === "auth-form";
    st().start("auth");
    st().next(formIsMissing);
    expect(TOURS.auth[st().index]!.target).toBe("auth-unavailable");
    st().back(formIsMissing);
    expect(st().index).toBe(0);
    st().next(); // nothing reported missing: the optional step is shown
    expect(TOURS.auth[st().index]!.target).toBe("auth-form");
    st().back();
    st().back();
    expect(st().index).toBe(0); // nowhere further back
  });

  it("every step that opens a panel is on the globe page, and optional steps are never first or last", () => {
    for (const [id, steps] of Object.entries(TOURS)) {
      if (id !== "explore") expect(steps.some((s) => s.scene)).toBe(false);
      expect(steps[0]!.optional).toBeFalsy();
      expect(steps[steps.length - 1]!.optional).toBeFalsy();
      expect(new Set(steps.map((s) => s.title)).size).toBe(steps.length); // titles are used as keys
    }
  });

  it("maps routes to tours", () => {
    expect(tourForPath("/targets")).toBe("targets");
    expect(tourForPath("/explore/mars")).toBe("explore");
    expect(tourForPath("/")).toBe("landing");
    expect(tourForPath("/auth")).toBe("auth");
    expect(tourForPath("/lab")).toBe("lab");
    expect(tourForPath("/auth/update-password")).toBeNull();
  });
});
