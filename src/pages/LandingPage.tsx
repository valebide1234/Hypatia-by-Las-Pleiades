import { useNavigate } from "react-router-dom";
import PleiadesBackground from "@/components/pleiades/PleiadesBackground";
import { useSession } from "@/store/session";

export default function LandingPage() {
  const navigate = useNavigate();
  const { status, user, startGuest } = useSession();

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

      <main className="sky-text flex flex-col items-center text-center">
        <h1 className="font-display text-6xl font-medium tracking-[0.12em] text-white sm:text-8xl">Hypatia</h1>
        <p className="mt-3 text-sm uppercase tracking-[0.35em] text-pleiad-300 sm:text-base">
          NASA terrestrial analog finder
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-start sm:justify-center">
          <div className="flex flex-col items-center">
            <button type="button" className="btn-primary w-full sm:w-64" onClick={onLogin} disabled={status === "loading"}>
              Log in / Sign up
            </button>
            {status === "signedIn" && (
              <span className="mt-2 text-xs text-slate-300">Signed in as {user?.email}</span>
            )}
          </div>
          <div className="flex flex-col items-center">
            <button type="button" className="btn-ghost w-full sm:w-64" onClick={onGuest}>
              Continue without an account
            </button>
            <span className="mt-2 text-xs text-slate-300">Your searches and favourites won't be saved.</span>
          </div>
        </div>
      </main>

      <footer className="sky-text absolute bottom-3 left-0 right-0 text-center text-[11px] text-slate-500">
        Background: procedural rendering of the Pleiades (M45), star positions from the Hipparcos catalogue.
      </footer>
    </div>
  );
}
