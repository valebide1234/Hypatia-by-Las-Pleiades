import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PleiadesBackground from "@/components/pleiades/PleiadesBackground";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useSession } from "@/store/session";

type Mode = "signin" | "signup" | "reset";

export default function AuthPage() {
  const [params] = useSearchParams();
  const initialMode = params.get("mode");
  const [mode, setMode] = useState<Mode>(initialMode === "signup" || initialMode === "reset" ? initialMode : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const status = useSession((s) => s.status);
  const navigate = useNavigate();

  // Already signed in (or just finished signing in): go straight to target selection.
  useEffect(() => {
    if (status === "signedIn") navigate("/targets", { replace: true });
  }, [status, navigate]);

  const redirectTo = `${window.location.origin}/targets`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (error) throw error;
        // Same message whether or not the address has an account, so emails can't be probed.
        setNotice("If an account exists for that address, a reset link is on its way. Open it in this browser.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setError(error.message);
  };

  return (
    <div className="relative flex min-h-full items-center justify-center px-4 py-10">
      <PleiadesBackground />
      <div className="glass w-full max-w-sm p-6 sm:p-8">
        <Link to="/" className="font-display text-3xl text-white">
          Hypatia
        </Link>

        <div role="tablist" aria-label="Account" className="mt-6 grid grid-cols-2 rounded-full bg-space-800 p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`rounded-full py-1.5 transition-colors ${mode === m ? "bg-pleiad-300 text-space-950" : "text-slate-300 hover:text-white"}`}
            >
              {m === "signin" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        {!isSupabaseConfigured ? (
          <>
            <p className="mt-6 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              Accounts aren't available yet: Supabase isn't configured. Add <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> (see <code>.env.example</code>), or continue as a guest.
            </p>
            {import.meta.env.DEV && (
              <button
                type="button"
                className="btn-ghost mt-4 w-full"
                onClick={() => {
                  useSession.getState().startDemo();
                  navigate("/targets");
                }}
              >
                Use local demo account (development only)
              </button>
            )}
          </>
        ) : (
          <>
            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Email
                <input
                  className="field"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {mode === "reset" && (
                <p className="text-sm text-slate-300">
                  Enter your account email and we'll send you a link to choose a new password.
                </p>
              )}
              {mode !== "reset" && (
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="flex items-center justify-between">
                  Password
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-pleiad-300 hover:text-white"
                      onClick={() => {
                        setMode("reset");
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
                <input
                  className="field"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              )}
              <button type="submit" className="btn-primary mt-2" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
              </button>
              {mode === "reset" && (
                <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => setMode("signin")}>
                  Back to log in
                </button>
              )}
            </form>

            {mode !== "reset" && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                  <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
                </div>
                <button type="button" className="btn-ghost w-full" onClick={onGoogle}>
                  <GoogleMark /> Continue with Google
                </button>
              </>
            )}
          </>
        )}

        <div aria-live="polite" className="mt-4 text-sm">
          {error && <p className="text-rose-300">{error}</p>}
          {notice && <p className="text-emerald-300">{notice}</p>}
        </div>

        <Link to="/" className="mt-4 inline-block text-xs text-slate-400 hover:text-white">
          ← Back
        </Link>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
