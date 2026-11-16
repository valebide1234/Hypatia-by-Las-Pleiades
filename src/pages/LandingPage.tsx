import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TourButton from "@/components/tour/TourButton";
import { useTour } from "@/store/tour";
import PleiadesBackground from "@/components/pleiades/PleiadesBackground";
import { useSession } from "@/store/session";
import { useT } from "@/i18n";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { TeamLine } from "@/components/common/Credits";

export default function LandingPage() {
  const navigate = useNavigate();
  const t = useT();
  const { status, user, startGuest } = useSession();

  // First visit: the tour starts here, on the very first screen.
  useEffect(() => useTour.getState().startIfFirstVisit("landing"), []);

  const onLogin = () => {
    // A valid session skips the auth form entirely.
    navigate(status === "signedIn" ? "/targets" : "/auth");
  };

  const onGuest = () => {
    startGuest();
    navigate("/targets");
  };

  return (
    <div className="relative flex min-h-full flex-col items-center justify-end overflow-hidden px-4 pb-[14vh] pt-[48vh] sm:justify-center sm:pb-0 sm:pt-[34vh]">
      <PleiadesBackground />
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <LanguageSwitcher />
        <TourButton className="bg-space-950/40 backdrop-blur" />
      </div>

      <main className="sky-text flex flex-col items-center text-center">
        <h1 className="font-display text-6xl font-medium tracking-[0.12em] text-white sm:text-8xl">Hypatia</h1>
        <p className="mt-3 text-sm uppercase tracking-[0.35em] text-pleiad-300 sm:text-base">
          {t("NASA terrestrial analog finder")}
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-start sm:justify-center">
          <div className="flex flex-col items-center" data-tour="landing-login">
            <button type="button" className="btn-primary w-full sm:w-64" onClick={onLogin} disabled={status === "loading"}>
              {t("Log in / Sign up")}
            </button>
            {status === "signedIn" && (
              <span className="mt-2 text-xs text-slate-300">{t("Signed in as {email}", { email: user?.email ?? "" })}</span>
            )}
          </div>
          <div className="flex flex-col items-center" data-tour="landing-guest">
            <button type="button" className="btn-ghost w-full sm:w-64" onClick={onGuest}>
              {t("Continue without an account")}
            </button>
            <span className="mt-2 text-xs text-slate-300">{t("Your searches and favourites won't be saved.")}</span>
          </div>
        </div>
      </main>

      <footer className="sky-text absolute bottom-3 left-0 right-0 text-center text-[11px] text-slate-500">
        <TeamLine className="mb-1 text-xs text-slate-300" />
        {t("Background: procedural rendering of the Pleiades (M45), star positions from the Hipparcos catalogue.")}
      </footer>
    </div>
  );
}
