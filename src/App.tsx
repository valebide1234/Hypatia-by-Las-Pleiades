import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { hasEnteredApp, isDemoUser, useSession } from "@/store/session";
import { useUserData } from "@/store/userData";
import { supabase } from "@/lib/supabase";
import { createSupabaseRepo } from "@/data/repo/supabaseRepo";
import { createLocalRepo } from "@/data/repo/localRepo";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import UpdatePasswordPage from "@/pages/UpdatePasswordPage";
import TargetSelectPage from "@/pages/TargetSelectPage";
import ExplorePage from "@/pages/ExplorePage";
import LabPage from "@/pages/LabPage";
import AppShell from "@/components/layout/AppShell";
import LoadingSky from "@/components/layout/LoadingSky";
import Tour from "@/components/tour/Tour";

/** Routes behind the landing screen: open to guests and signed-in users only. */
function RequireEntry() {
  const status = useSession((s) => s.status);
  if (status === "loading") return <LoadingSky />;
  if (!hasEnteredApp(status)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const init = useSession((s) => s.init);
  useEffect(() => init(), [init]);

  // Load the signed-in user's favourites and saved searches; clear them on sign-out.
  const user = useSession((s) => s.user);
  useEffect(() => {
    const { connect, disconnect } = useUserData.getState();
    if (!user) {
      disconnect();
      return;
    }
    if (isDemoUser(user)) void connect(createLocalRepo());
    else if (supabase) void connect(createSupabaseRepo(supabase));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/update-password" element={<UpdatePasswordPage />} />
      <Route element={<RequireEntry />}>
        <Route element={<AppShell />}>
          <Route path="/targets" element={<TargetSelectPage />} />
          <Route path="/explore/:target" element={<ExplorePage />} />
          <Route path="/lab" element={<LabPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Tour />
    </>
  );
}
