import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSession } from "@/store/session";
import GuestBadge from "./GuestBadge";
import TargetToggle from "./TargetToggle";
import { useEffect, useState } from "react";
import FavouritesDrawer from "@/components/favourites/FavouritesDrawer";
import UndoToast from "@/components/favourites/UndoToast";
import { isDemoUser } from "@/store/session";
import { useUi } from "@/store/ui";
import { useUserData } from "@/store/userData";
import AssistantDock, { AssistantButton } from "@/components/assistant/AssistantDock";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import TourButton from "@/components/tour/TourButton";
import { useT } from "@/i18n";
import { useLab } from "@/lab/store";
import { useEngine } from "@/store/engine";

export default function AppShell() {
  const { status, user, signOut } = useSession();
  const navigate = useNavigate();
  const setFavouritesOpen = useUi((s) => s.setFavouritesOpen);
  const favCount = useUserData((s) => s.fav.favourites.length);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const t = useT();

  // The engine's data are needed on every page: saved candidates are rebuilt from them.
  // The Lab's data carry the Spanish of the engine's texts (region names and so on).
  useEffect(() => {
    void useEngine.getState().load();
    void useLab.getState().load();
  }, []);

  return (
    <div className="flex h-full flex-col bg-space-950">
      <header className="z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-space-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/targets" className="font-display text-2xl tracking-wide text-white">
            Hypatia
          </Link>
          <TargetToggle />
          <NavLink
            to="/lab"
            data-tour="lab-link"
            onClick={() => {
              // Keep studying the same body in the Lab.
              const body = /^\/explore\/(moon|mars)$/.exec(window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), ""))?.[1];
              if (body === "moon" || body === "mars") useLab.getState().select({ target: body });
            }}
            className={({ isActive }) =>
              `rounded-full border px-3 py-1 text-xs transition-colors ${isActive ? "border-pleiad-300 bg-pleiad-300/15 text-white" : "border-white/15 text-slate-200 hover:border-white/40"}`
            }
          >
            {t("Lab")}
          </NavLink>
          <AssistantButton />
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <TourButton />
          <div className="relative" data-tour="favourites">
            <button
              type="button"
              onClick={() => (status === "signedIn" ? setFavouritesOpen(true) : setGuestPrompt((v) => !v))}
              aria-label={status === "signedIn" ? `${t("Favourites")} (${favCount})` : t("Favourites")}
              aria-expanded={status === "signedIn" ? undefined : guestPrompt}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
            >
              <span aria-hidden="true" className="text-sm text-amber-200">
                {favCount > 0 ? "★" : "☆"}
              </span>
              <span className="hidden sm:inline">{t("Favourites")}</span>
              {status === "signedIn" && favCount > 0 && <span className="tabular-nums text-slate-400">{favCount}</span>}
            </button>
            {guestPrompt && status !== "signedIn" && (
              <div role="dialog" aria-label={t("Sign in to save and organize favourites")} className="glass absolute right-0 top-full z-50 mt-2 w-64 !bg-space-900/95 p-3 text-xs text-slate-300">
                <p className="font-medium text-white">{t("Sign in to save and organize favourites")}</p>
                <p className="mt-1">{t("Favourites, folders and saved searches need an account.")}</p>
                <div className="mt-3 flex gap-2">
                  <Link to="/auth" className="rounded-full bg-pleiad-300 px-3 py-1 font-medium text-space-950 hover:bg-white">
                    {t("Log in")}
                  </Link>
                  <Link to="/auth?mode=signup" className="rounded-full border border-white/20 px-3 py-1 hover:border-white/50">
                    {t("Sign up")}
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div data-tour="account" className="flex items-center gap-3">
          {status === "guest" && <GuestBadge />}
          {status === "signedIn" && (
            <>
              <span className="hidden text-xs text-slate-400 sm:inline" title={t("Signed in")}>
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
                {t("Sign out")}
              </button>
            </>
          )}
          </div>
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <Outlet />
        <FavouritesDrawer />
      </main>
      <UndoToast />
      <AssistantDock />
    </div>
  );
}
