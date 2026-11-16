import { useMatch, useNavigate } from "react-router-dom";
import { TARGETS, TARGET_LABEL, isTarget } from "@/types/site";
import { useT } from "@/i18n";

/** Moon / Mars switch in the top bar; only shown on the globe view. */
export default function TargetToggle() {
  const match = useMatch("/explore/:target");
  const navigate = useNavigate();
  const tr = useT();
  const current = match?.params.target;
  if (!isTarget(current)) return null;

  return (
    <div role="radiogroup" aria-label={tr("Target")} data-tour="target-toggle" className="flex rounded-full border border-white/15 bg-space-800 p-0.5 text-xs">
      {TARGETS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={current === t}
          onClick={() => navigate(`/explore/${t}`)}
          className={`rounded-full px-3 py-1 transition-colors ${current === t ? "bg-pleiad-300 font-medium text-space-950" : "text-slate-300 hover:text-white"}`}
        >
          {tr(TARGET_LABEL[t])}
        </button>
      ))}
    </div>
  );
}
