import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { KIND_HELP, KIND_LABEL } from "@/lab/format";
import type { ValueKind } from "@/lab/types";

/** Colours of the Lab's charts, validated for colour-blind separation on the app's dark surface. */
export const CHART = { place: "#3987e5", region: "#d95926", near: "#199e70", neutral: "#64748b" } as const;

export function Card({ title, children, className = "", tour }: { title?: string; children: ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={`glass p-5 ${className}`}>
      {title && <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>}
      {children}
    </section>
  );
}

/** Horizontal meter for a value between 0 and 1; the number is always shown next to it. */
export function Meter({ value, color = CHART.place, label }: { value: number | null | undefined; color?: string; label?: string }) {
  const v = value == null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-space-700" role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <span className="block h-full rounded-r-[4px]" style={{ width: `${v * 100}%`, backgroundColor: color }} />
    </span>
  );
}

const KIND_CLASS: Record<ValueKind, string> = {
  measured: "border-emerald-300/40 text-emerald-100",
  reanalysis: "border-sky-300/40 text-sky-100",
  modeled: "border-violet-300/40 text-violet-100",
  derived: "border-slate-300/40 text-slate-200",
  literature: "border-slate-300/40 text-slate-200",
  expert_coded: "border-amber-300/50 text-amber-100",
  physical_zero: "border-slate-300/40 text-slate-200",
};

export function KindChip({ kind }: { kind: ValueKind | null }) {
  const t = useT();
  if (!kind) return <span className="text-slate-600">—</span>;
  return (
    <span title={t(KIND_HELP[kind])} className={`inline-block whitespace-nowrap rounded border px-1.5 text-[10px] uppercase tracking-wider ${KIND_CLASS[kind]}`}>
      {t(KIND_LABEL[kind])}
    </span>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3 text-xs leading-relaxed text-amber-50/90">{children}</p>;
}
