import { Link, Outlet, useNavigate } from "react-router-dom";
import { useSession } from "@/store/session";
import GuestBadge from "./GuestBadge";
import TargetToggle from "./TargetToggle";
import { useState } from "react";
import FavouritesDrawer from "@/components/favourites/FavouritesDrawer";
import UndoToast from "@/components/favourites/UndoToast";
import { isDemoUser } from "@/store/session";
import { useUi } from "@/store/ui";
import { useUserData } from "@/store/userData";

export default function AppShell() {
  const { status, user, signOut } = useSession();
  const navigate = useNavigate();
  const setFavouritesOpen = useUi((s) => s.setFavouritesOpen);
  const favCount = useUserData((s) => s.fav.favourites.length);
  const [guestPrompt, setGuestPrompt] = useState(false);

  return (
    <div className="flex h-full flex-col bg-space-950">
      <header className="z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-space-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/targets" className="font-display text-2xl tracking-wide text-white">
            Hypatia
          </Link>
          <TargetToggle />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => (status === "signedIn" ? setFavouritesOpen(true) : setGuestPrompt((v) => !v))}
              aria-label={status === "signedIn" ? `Favourites (${favCount})` : "Favourites"}
              aria-expanded={status === "signedIn" ? undefined : guestPrompt}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
            >
              <span aria-hidden="true" className="text-sm text-amber-200">
                {favCount > 0 ? "★" : "☆"}
              </span>
              <span className="hidden sm:inline">Favourites</span>
              {status === "signedIn" && favCount > 0 && <span className="tabular-nums text-slate-400">{favCount}</span>}
            </button>
            {guestPrompt && status !== "signedIn" && (
              <div role="dialog" aria-label="Sign in to save and organize favourites" className="glass absolute right-0 top-full z-50 mt-2 w-64 !bg-space-900/95 p-3 text-xs text-slate-300">
                <p className="font-medium text-white">Sign in to save and organize favourites</p>
                <p className="mt-1">Favourites, folders and saved searches need an account.</p>
                <div className="mt-3 flex gap-2">
                  <Link to="/auth" className="rounded-full bg-pleiad-300 px-3 py-1 font-medium text-space-950 hover:bg-white">
                    Log in
                  </Link>
                  <Link to="/auth?mode=signup" className="rounded-full border border-white/20 px-3 py-1 hover:border-white/50">
                    Sign up
                  </Link>
                </div>
              </div>
            )}
          </div>
          {status === "guest" && <GuestBadge />}
          {status === "signedIn" && (
            <>
              <span className="hidden text-xs text-slate-400 sm:inline" title="Signed in">
                {user?.email}
                {isDemoUser(user) && " (demo)"}
              </span>
              <button
                type="button"
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <Outlet />
        <FavouritesDrawer />
      </main>
      <UndoToast />
    </div>
  );
}
