import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import PleiadesBackground from "@/components/pleiades/PleiadesBackground";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/store/session";

/**
 * Landing page for the password-reset email. supabase-js exchanges the `code` in the URL
 * for a short-lived recovery session (detectSessionInUrl), after which the user can set a
 * new password with updateUser().
 */
export default function UpdatePasswordPage() {
  const status = useSession((s) => s.status);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waited, setWaited] = useState(false);

  // Give the URL code exchange a moment before declaring the link invalid.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  };

  const ready = status === "signedIn";

  return (
    <div className="relative flex min-h-full items-center justify-center px-4 py-10">
      <PleiadesBackground />
      <div className="glass w-full max-w-sm p-6 sm:p-8">
        <Link to="/" className="font-display text-3xl text-white">
          Hypatia
        </Link>
        <h1 className="mt-4 text-lg font-medium text-white">Choose a new password</h1>

        {done ? (
          <div className="mt-4 flex flex-col gap-4 text-sm">
            <p className="text-emerald-300">Your password has been updated.</p>
            <button type="button" className="btn-primary" onClick={() => navigate("/targets")}>
              Continue to Hypatia
            </button>
          </div>
        ) : ready ? (
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              New password
              <input className="field" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Confirm new password
              <input className="field" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary mt-2" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        ) : waited || !supabase ? (
          <div className="mt-4 text-sm text-slate-300">
            <p>This reset link is invalid or has expired. Reset links only work in the browser where you requested them.</p>
            <Link to="/auth?mode=reset" className="mt-4 inline-block text-pleiad-300 hover:text-white">
              Request a new link
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400" role="status">
            Verifying your reset link…
          </p>
        )}

        <div aria-live="polite" className="mt-4 text-sm">
          {error && <p className="text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
