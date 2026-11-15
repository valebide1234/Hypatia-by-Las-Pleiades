import { useEffect } from "react";
import { findSite } from "@/data/siteRegistry";
import { useUserData } from "@/store/userData";

const UNDO_MS = 8000;

/** "Removed X · Undo" toast shown after a favourite is removed. */
export default function UndoToast() {
  const removed = useUserData((s) => s.lastRemoved);
  const { undoRemove, dismissUndo } = useUserData.getState();

  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(dismissUndo, UNDO_MS);
    return () => clearTimeout(t);
  }, [removed, dismissUndo]);

  if (!removed) return null;
  const name = findSite(removed.favourite.siteId)?.name ?? "site";
  return (
    <div role="status" aria-live="polite" className="glass fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 !bg-space-800/95 px-4 py-2.5 text-sm text-slate-200">
      Removed “{name}” from favourites.
      <button type="button" onClick={() => void undoRemove()} className="rounded-full bg-pleiad-300 px-3 py-1 text-xs font-semibold text-space-950 hover:bg-white">
        Undo
      </button>
      <button type="button" onClick={dismissUndo} aria-label="Dismiss" className="text-slate-400 hover:text-white">
        ×
      </button>
    </div>
  );
}
