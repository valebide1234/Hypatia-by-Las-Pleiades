import { useMemo, useState } from "react";
import { NASA_BADGE_URL, PIN_SIZE, pinImage } from "./pinImages";
import { ORIGIN_LABEL, type AnalogSite, type SiteOrigin } from "@/types/site";

const ORIGINS: SiteOrigin[] = ["nasa_official", "literature", "hypatia_candidate"];

const ORIGIN_HELP: Record<SiteOrigin, string> = {
  nasa_official: "Used in NASA analog field work (circular badge)",
  literature: "Other agencies or the scientific literature (teardrop pin)",
  hypatia_candidate: "Proposed by Hypatia's discovery module, unverified (amber diamond)",
};

export function PinIcon({ origin, scale = 0.7 }: { origin: SiteOrigin; scale?: number }) {
  const size = PIN_SIZE[origin];
  const src = useMemo(() => (origin === "nasa_official" ? NASA_BADGE_URL : pinImage(origin).toDataURL()), [origin]);
  return (
    <span className="flex w-8 shrink-0 items-center justify-center" aria-hidden="true">
      <img
        src={src}
        alt=""
        width={size.width * scale}
        height={size.height * scale}
        className={origin === "nasa_official" ? "rounded-full ring-2 ring-white" : ""}
      />
    </span>
  );
}

interface Props {
  sites: AnalogSite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  listLabel?: string;
}

/** Legend for the three pin types plus a keyboard-accessible list of every visible site. */
export default function SitesOverlay({ sites, selectedId, onSelect, listLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const counts = useMemo(() => {
    const c: Record<SiteOrigin, number> = { nasa_official: 0, literature: 0, hypatia_candidate: 0 };
    for (const s of sites) c[s.origin]++;
    return c;
  }, [sites]);
  const sorted = useMemo(() => [...sites].sort((a, b) => a.name.localeCompare(b.name)), [sites]);

  return (
    <aside className="glass pointer-events-auto flex min-h-0 shrink-0 flex-col overflow-hidden text-sm">
      <section aria-labelledby="legend-title" className="px-4 pb-1 pt-3">
        <h2 id="legend-title" className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400">
          <button
            type="button"
            className="flex w-full items-center justify-between hover:text-white"
            aria-expanded={legendOpen}
            aria-controls="legend-list"
            onClick={() => setLegendOpen((v) => !v)}
          >
            Legend<span aria-hidden="true">{legendOpen ? "▾" : "▸"}</span>
          </button>
        </h2>
        {legendOpen && (
        <ul id="legend-list" className="mt-3 flex flex-col gap-2.5 pb-3">
          {ORIGINS.map((o) => (
            <li key={o} className="flex items-center gap-3">
              <PinIcon origin={o} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 text-slate-100">
                  {ORIGIN_LABEL[o]}
                  <span className="text-xs text-slate-500">{counts[o]}</span>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">{ORIGIN_HELP[o]}</p>
              </div>
            </li>
          ))}
        </ul>
        )}
      </section>

      <section className="flex min-h-0 flex-col border-t border-white/10">
        <button
          type="button"
          className="flex items-center justify-between px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-white"
          aria-expanded={open}
          aria-controls="site-list"
          onClick={() => setOpen((v) => !v)}
        >
          {listLabel ?? "Sites"} ({sites.length})<span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <ul id="site-list" className="min-h-0 overflow-y-auto px-2 pb-2">
            {sorted.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={s.id === selectedId}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 ${s.id === selectedId ? "bg-white/10" : ""}`}
                >
                  <PinIcon origin={s.origin} scale={0.5} />
                  <span className="min-w-0 flex-1 truncate text-slate-200">{s.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{s.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
