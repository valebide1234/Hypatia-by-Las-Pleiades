import { useEffect } from "react";
import { useT } from "@/i18n";
import { useAssistant } from "@/store/assistant";
import AssistantChat from "./AssistantChat";

/** The assistant's chat panel, opened from the button in the top bar on every page. */
export default function AssistantDock() {
  const t = useT();
  const { open, setOpen } = useAssistant();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label={t("Hypatia assistant")}
          className="glass fixed left-3 top-14 z-50 flex h-[min(36rem,calc(100vh-4.5rem))] w-[min(27rem,calc(100vw-1.5rem))] flex-col !bg-space-900/95 p-4"
        >
          <header className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-2xl text-white">{t("Hypatia assistant")}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Close the assistant")} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <AssistantChat compact />
        </section>
      )}
    </>
  );
}

/** Button in the top bar that opens and closes the assistant. */
export function AssistantButton() {
  const t = useT();
  const { open, setOpen } = useAssistant();
  return (
    <button
      type="button"
      data-tour="assistant"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${open ? "border-pleiad-300 bg-pleiad-300/15 text-white" : "border-pleiad-300/50 text-white hover:border-pleiad-300"}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="text-pleiad-300">
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" strokeLinejoin="round" />
      </svg>
      {t("Assistant")}
    </button>
  );
}
