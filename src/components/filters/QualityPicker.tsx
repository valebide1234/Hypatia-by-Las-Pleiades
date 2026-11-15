import { QUALITIES, QUALITY_CATEGORIES, qualitiesForTarget } from "@/data/qualities";
import type { Target } from "@/types/site";

interface Props {
  /** "both" shows every quality (e.g. in the Favourites panel). */
  target: Target | "both";
  selected: readonly string[];
  onToggle: (qualityId: string) => void;
  /** Optional per-quality counts (e.g. number of sites that have it) shown after the label. */
  counts?: ReadonlyMap<string, number>;
}

/**
 * Reusable quality selector, grouped by category and limited to qualities relevant to the
 * target. Used by the globe filter bar, the Favourites panel and the Discovery panel.
 * Selected chips show a check mark as well as a colour change.
 */
export default function QualityPicker({ target, selected, onToggle, counts }: Props) {
  const qualities = target === "both" ? QUALITIES : qualitiesForTarget(target);
  return (
    <div className="space-y-4">
      {QUALITY_CATEGORIES.map((cat) => {
        const items = qualities.filter((q) => q.category === cat.id);
        if (items.length === 0) return null;
        return (
          <fieldset key={cat.id}>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{cat.label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {items.map((q) => {
                const on = selected.includes(q.id);
                const count = counts?.get(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    aria-pressed={on}
                    title={q.description}
                    onClick={() => onToggle(q.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on ? "border-pleiad-300 bg-pleiad-300 font-medium text-space-950" : "border-white/15 text-slate-200 hover:border-white/40"
                    }`}
                  >
                    <span aria-hidden="true" className="w-3 text-center">{on ? "✓" : "+"}</span>
                    {q.label}
                    {count !== undefined && <span className={on ? "text-space-800" : "text-slate-500"}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
