import Popover from "@/components/common/Popover";
import { QUALITY_BY_ID } from "@/data/qualities";
import type { Target } from "@/types/site";
import QualityPicker from "./QualityPicker";
import RankingInfo from "./RankingInfo";
import type { ReactNode } from "react";
import { useT } from "@/i18n";

interface Props {
  target: Target;
  selected: readonly string[];
  onToggle: (qualityId: string) => void;
  onClear: () => void;
  /** Number of matching sites, or null when no filter is active. */
  matchCount: number | null;
  totalCount: number;
  counts: ReadonlyMap<string, number>;
  /** Saved-search controls (rendered next to Clear filters). */
  savedSearches?: ReactNode;
  onDiscover?: () => void;
}

export default function FilterBar({ target, selected, onToggle, onClear, matchCount, totalCount, counts, savedSearches, onDiscover }: Props) {
  const t = useT();
  return (
    <div className="relative z-20 flex min-h-[3rem] items-center gap-2 border-b border-white/10 bg-space-900/85 px-3 py-1.5 backdrop-blur" role="search" aria-label={t("Filter analog sites")}>
      <Popover
        label={t("Filter by quality")}
        className="max-h-[70vh] w-[min(40rem,calc(100vw-1.5rem))] overflow-y-auto"
        trigger={(p) => (
          <button
            {...p}
            type="button"
            data-tour="filter"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-space-800 px-3 py-1.5 text-xs font-medium text-white hover:border-white/40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            {t("Filter by quality")}
            {selected.length > 0 && <span className="rounded-full bg-pleiad-300 px-1.5 text-[10px] text-space-950">{selected.length}</span>}
            <span aria-hidden="true">▾</span>
          </button>
        )}
      >
        <p className="mb-3 text-xs text-slate-400">
          {t("Select the qualities you want to study. Sites must have all of them. The numbers show how many sites list each one.")}
        </p>
        <QualityPicker target={target} selected={selected} onToggle={onToggle} counts={counts} />
      </Popover>

      {onDiscover && (
        <button
          type="button"
          data-tour="discover"
          onClick={onDiscover}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300/50 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-300/10"
        >
          <span aria-hidden="true">◆</span> {t("Discover new analogs")}
        </button>
      )}
      <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5" aria-label={t("Active filters")}>
        {selected.map((id) => (
          <li key={id} className="shrink-0">
            <button
              type="button"
              onClick={() => onToggle(id)}
              className="inline-flex items-center gap-1 rounded-full bg-pleiad-300/15 py-1 pl-2.5 pr-2 text-xs text-pleiad-300 ring-1 ring-pleiad-300/40 hover:bg-pleiad-300/25"
              aria-label={`${t("Remove filter")}: ${t(QUALITY_BY_ID.get(id)?.label ?? id)}`}
            >
              {t(QUALITY_BY_ID.get(id)?.label ?? id)}
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
        {selected.length === 0 && <li className="truncate text-xs text-slate-500">{t("Showing all {n} sites. Add qualities to rank the best matches.", { n: totalCount })}</li>}
      </ul>

      <div className="flex shrink-0 items-center gap-1">
        {matchCount !== null && (
          <span className="hidden text-xs tabular-nums text-slate-300 sm:inline" aria-live="polite">
            {matchCount === 1 ? t("1 match") : t("{n} matches", { n: matchCount })}
          </span>
        )}
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="rounded-full px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
            {t("Clear filters")}
          </button>
        )}
        {savedSearches}
        <RankingInfo />
      </div>
    </div>
  );
}
