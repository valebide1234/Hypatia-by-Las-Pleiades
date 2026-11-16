import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { hasEnteredApp, useSession } from "./session";

const fakeSession = { user: { id: "u1", email: "a@example.com" } } as unknown as Session;

describe("session store", () => {
  beforeEach(() => useSession.setState({ status: "signedOut", user: null, session: null }));

  it("guest mode lets the user into the app without a session", () => {
    useSession.getState().startGuest();
    expect(useSession.getState().status).toBe("guest");
    expect(hasEnteredApp(useSession.getState().status)).toBe(true);
  });

  it("a Supabase session upgrades a guest to signed in", () => {
    useSession.getState().startGuest();
    useSession.getState().applySession(fakeSession);
    expect(useSession.getState().status).toBe("signedIn");
    expect(useSession.getState().user?.id).toBe("u1");
  });

  it("an empty session event does not kick a guest out", () => {
    useSession.getState().startGuest();
    useSession.getState().applySession(null);
    expect(useSession.getState().status).toBe("guest");
  });

  it("signing out returns to the landing state", async () => {
    useSession.getState().applySession(fakeSession);
    await useSession.getState().signOut();
    expect(useSession.getState().status).toBe("signedOut");
    expect(hasEnteredApp("signedOut")).toBe(false);
  });
});
