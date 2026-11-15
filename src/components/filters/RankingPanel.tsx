import { PinIcon } from "@/components/globe/SitesOverlay";
import { QUALITY_BY_ID } from "@/data/qualities";
import { STRENGTH_WEIGHT, TOP_N, strengthSummary, type RankedSite } from "@/lib/ranking";

interface Props {
  ranking: RankedSite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hint: { drop: string; matches: number } | null;
  onApplyHint: (qualityId: string) => void;
  /** Signed-in users: saved site ids and a quick "save to Unfiled" action. */
  favouriteIds?: ReadonlySet<string>;
  onQuickSave?: (siteId: string) => void;
}

/** Ordered list of the top matches for the active filters. */
export default function RankingPanel({ ranking, selectedId, onSelect, hint, onApplyHint, favouriteIds, onQuickSave }: Props) {
  const top = ranking.slice(0, TOP_N);
  return (
    <section aria-labelledby="ranking-title" className="glass pointer-events-auto flex min-h-0 flex-col overflow-hidden text-sm">
      <h2 id="ranking-title" className="flex items-baseline justify-between px-4 pb-2 pt-3.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
        {ranking.length === 0 ? "No matches" : `Top ${Math.min(TOP_N, ranking.length)} match${ranking.length === 1 ? "" : "es"}`}
        <span className="font-normal normal-case tracking-normal text-slate-500">{ranking.length} total</span>
      </h2>

      {ranking.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-slate-300" role="status">
          <p>No site has all the selected qualities without listing one of them as a limitation.</p>
          {hint && (
            <button
              type="button"
              onClick={() => onApplyHint(hint.drop)}
              className="mt-3 rounded-full border border-white/20 px-3 py-1.5 text-left hover:border-white/50"
            >
              Remove “{QUALITY_BY_ID.get(hint.drop)?.label ?? hint.drop}” → {hint.matches} match{hint.matches === 1 ? "" : "es"}
            </button>
          )}
        </div>
      ) : (
        <ol className="min-h-0 overflow-y-auto px-2 pb-2">
          {top.map((r) => {
            const strongest = [...r.matched].sort((a, b) => STRENGTH_WEIGHT[b.strength] - STRENGTH_WEIGHT[a.strength]).slice(0, 2);
            return (
              <li key={r.site.id} className="relative">
                {onQuickSave && (
                  <button
                    type="button"
                    onClick={() => (favouriteIds?.has(r.site.id) ? onSelect(r.site.id) : onQuickSave(r.site.id))}
                    aria-label={favouriteIds?.has(r.site.id) ? `${r.site.name} is in favourites (open to edit)` : `Save ${r.site.name} to favourites`}
                    title={favouriteIds?.has(r.site.id) ? "In favourites" : "Save to favourites (Unfiled)"}
                    className="absolute bottom-1.5 right-2 z-10 text-sm text-amber-200 hover:text-amber-100"
                  >
                    {favouriteIds?.has(r.site.id) ? "★" : "☆"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(r.site.id)}
                  aria-current={r.site.id === selectedId}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5 ${r.site.id === selectedId ? "bg-white/10" : ""}`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pleiad-300 text-[11px] font-semibold tabular-nums text-space-950">
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <PinIcon origin={r.site.origin} scale={0.4} />
                      <span className="truncate text-slate-100">{r.site.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                      {strengthSummary(r.matched)} · {strongest.map((m) => QUALITY_BY_ID.get(m.qualityId)?.label ?? m.qualityId).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-300" title="Score">
                    {r.score.toFixed(1)}
                  </span>
                </button>
              </li>
            );
          })}
          {ranking.length > TOP_N && (
            <li className="px-2 pt-1 text-[11px] text-slate-500">+ {ranking.length - TOP_N} more matches, shown with their rank on the globe.</li>
          )}
        </ol>
      )}
    </section>
  );
}
