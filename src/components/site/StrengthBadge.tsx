import type { Strength } from "@/types/site";

const STYLE: Record<Strength, { dots: number; cls: string; label: string }> = {
  strong: { dots: 3, cls: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100", label: "Strong" },
  moderate: { dots: 2, cls: "border-sky-300/40 bg-sky-300/10 text-sky-100", label: "Moderate" },
  partial: { dots: 1, cls: "border-slate-300/30 bg-slate-300/10 text-slate-200", label: "Partial" },
};

/** Strength of an analog quality; shown as text + filled dots so it never relies on colour alone. */
export default function StrengthBadge({ strength }: { strength: Strength }) {
  const s = STYLE[strength];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.cls}`}>
      <span aria-hidden="true" className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < s.dots ? "bg-current" : "border border-current opacity-50"}`} />
        ))}
      </span>
      {s.label}
    </span>
  );
}
