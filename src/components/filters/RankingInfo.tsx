import Popover from "@/components/common/Popover";
import { FIDELITY_BONUS, STRENGTH_WEIGHT, TOP_N } from "@/lib/ranking";

/** "How is this ranked?" explanation. The numbers come from the ranking module itself. */
export default function RankingInfo() {
  return (
    <Popover
      label="How is this ranked?"
      align="right"
      className="w-[min(24rem,calc(100vw-2rem))] text-xs leading-relaxed text-slate-300"
      trigger={(p) => (
        <button {...p} type="button" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-slate-300 hover:text-white">
          <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
            i
          </span>
          How is this ranked?
        </button>
      )}
    >
      <h2 className="text-sm font-semibold text-white">How is this ranked?</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-4">
        <li>
          <strong className="text-slate-100">Matching.</strong> A site is shown only if <em>every</em> selected quality is among its
          similarities for the current target <em>and</em> none of them is listed as one of its limitations. A quality listed as a
          limitation never satisfies a filter.
        </li>
        <li>
          <strong className="text-slate-100">Score</strong> = sum of the strengths of the selected qualities (strong {STRENGTH_WEIGHT.strong}, moderate{" "}
          {STRENGTH_WEIGHT.moderate}, partial {STRENGTH_WEIGHT.partial}) + {FIDELITY_BONUS} × overall fidelity.
        </li>
        <li>
          <strong className="text-slate-100">Overall fidelity</strong> = the site's average similarity strength for this target ÷ 3
          (from 0.33 to 1). It is a small bonus that can reorder sites with equal sums but never outweighs a stronger match.
        </li>
        <li>
          <strong className="text-slate-100">Ties</strong> go to the site with more peer-reviewed references, then alphabetically.
        </li>
      </ol>
      <p className="mt-3 text-slate-400">
        Every match appears on the globe with its rank; the top {TOP_N} are enlarged and outlined. Hypatia candidates are ranked by
        the same rules. Strength ratings are curated judgements from the cited literature, not measurements.
      </p>
    </Popover>
  );
}
