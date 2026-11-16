import { useLocation } from "react-router-dom";
import { useTour } from "@/store/tour";
import { tourForPath } from "@/tour/steps";
import { useT } from "@/i18n";

/** Starts (or replays) the guided tour of the current page. Renders nothing on pages without one. */
export default function TourButton({ className = "" }: { className?: string }) {
  const t = useT();
  const tourId = tourForPath(useLocation().pathname);
  if (!tourId) return null;
  return (
    <button
      type="button"
      data-tour="tour-button"
      onClick={() => useTour.getState().start(tourId)}
      aria-label={t("Start the guided tour of this page")}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40 ${className}`}
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
        ?
      </span>
      <span className="hidden sm:inline">{t("Tour")}</span>
    </button>
  );
}
