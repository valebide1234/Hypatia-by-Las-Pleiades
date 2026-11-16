import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * - loading:   waiting for Supabase to restore a persisted session
 * - signedOut: nobody has entered the app yet (landing screen)
 * - guest:     "Continue without an account"; lives in memory only, so a reload ends it
 * - signedIn:  valid Supabase session
 */
export type AuthStatus = "loading" | "signedOut" | "guest" | "signedIn";

interface SessionState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  /** Subscribes to Supabase auth changes. Returns an unsubscribe function. */
  init: () => () => void;
  startGuest: () => void;
  /** Development only (no Supabase configured): a local demo account backed by localStorage. */
  startDemo: () => void;
  signOut: () => Promise<void>;
  /** Internal: apply a Supabase session (or its absence). Exported for tests. */
  applySession: (session: Session | null) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  session: null,

  applySession: (session) => {
    if (session) {
      set({ status: "signedIn", session, user: session.user });
    } else {
      // Losing a session never silently turns a guest into signedOut, and vice versa.
      set((s) => ({ status: s.status === "guest" ? "guest" : "signedOut", session: null, user: null }));
    }
  },

  init: () => {
    if (!supabase) {
      set((s) => ({ status: s.status === "loading" ? "signedOut" : s.status }));
      return () => {};
    }
    supabase.auth.getSession().then(({ data }) => get().applySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => get().applySession(session));
    return () => data.subscription.unsubscribe();
  },

  startGuest: () => set({ status: "guest", user: null, session: null }),

  startDemo: () => {
    if (!import.meta.env.DEV || supabase) return;
    set({ status: "signedIn", session: null, user: { id: DEMO_USER_ID, email: "demo@hypatia.local" } as User });
  },

  signOut: async () => {
    if (supabase) await supabase.auth.signOut();
    set({ status: "signedOut", user: null, session: null });
  },
}));

export const DEMO_USER_ID = "local-demo-user";
export const isDemoUser = (user: User | null) => user?.id === DEMO_USER_ID;

export const hasEnteredApp = (status: AuthStatus) => status === "guest" || status === "signedIn";
