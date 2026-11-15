import { useEffect, useMemo, useRef, useState } from "react";
import QualityPicker from "@/components/filters/QualityPicker";
import { PinIcon } from "@/components/globe/SitesOverlay";
import { QUALITY_BY_ID } from "@/data/qualities";
import { getDiscoveryProviders } from "@/discovery/registry";
import { useDiscovery } from "@/store/discovery";
import { useFilters } from "@/store/filters";
import { useUi } from "@/store/ui";
import { TARGET_LABEL, type Target } from "@/types/site";

interface Props {
  target: Target;
  onSelectSite: (siteId: string) => void;
}

/**
 * "Discover new analogs": the slot for the future discovery engine. It reuses the quality
 * picker, runs a registered provider, and puts validated candidates on the globe.
 */
export default function DiscoverPanel({ target, onSelectSite }: Props) {
  const open = useUi((s) => s.discoverOpen);
  const setOpen = useUi((s) => s.setDiscoverOpen);
  const globeQualities = useFilters((s) => s.selected[target]);
  const providers = useMemo(() => getDiscoveryProviders(), []);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [qualityIds, setQualityIds] = useState<string[]>([]);
  const [applyToGlobe, setApplyToGlobe] = useState(true);
  const { status, error, problems, lastRun, candidates, run, clear } = useDiscovery();
  const closeRef = useRef<HTMLButtonElement>(null);
  const provider = providers.find((p) => p.id === providerId);
  const targetCandidates = candidates.filter((c) => c.targets.includes(target));

  // Start from the globe's current filters each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setQualityIds(globeQualities);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const onRun = async () => {
    if (!provider) return;
    await run(provider, { target, qualityIds });
    if (applyToGlobe) useFilters.getState().setSelected(target, qualityIds);
  };

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-space-950/40" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="discover-title" className="glass m-3 flex w-[min(40rem,calc(100%-1.5rem))] flex-col overflow-hidden !bg-space-900/95">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 id="discover-title" className="font-display text-2xl text-white">
            Discover new {TARGET_LABEL[target]} analogs
          </h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close discovery panel" className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm text-slate-300">
          <div className="rounded-xl border border-dashed border-amber-300/50 bg-amber-300/[0.06] p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-100">
              <PinIcon origin="hypatia_candidate" scale={0.5} /> Discovery engine coming soon
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
              Hypatia will compare Earth and planetary datasets to propose places that no space agency has catalogued as analogs
              yet. Its results will appear as amber <strong>Hypatia candidates</strong>: unverified, ranked with the same rules as known
              sites, and never presented as officially recognised.
            </p>
          </div>

          <section aria-labelledby="dq-title">
            <h3 id="dq-title" className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              What do you want to study?
            </h3>
            <QualityPicker
              target={target}
              selected={qualityIds}
              onToggle={(id) => setQualityIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" disabled className="accent-pleiad-300" />
              Limit to a region (draw on the globe). Available when the engine is connected.
            </label>
          </section>

          <section aria-labelledby="dp-title" className="space-y-2">
            <h3 id="dp-title" className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Provider
            </h3>
            {providers.length === 0 ? (
              <p className="text-xs text-slate-500">No discovery provider is installed yet.</p>
            ) : (
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="field !w-auto !py-1.5 !text-xs" aria-label="Discovery provider">
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {provider?.isTestData && (
              <p role="note" className="rounded-lg border border-rose-300/40 bg-rose-300/10 p-2.5 text-xs text-rose-100">
                <strong>TEST DATA.</strong> This provider returns synthetic candidates to check the pipeline (pins, ranking, side panel,
                favourites). They are not real analog proposals. Disable it with <code>ENABLE_MOCK_DISCOVERY</code>.
              </p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={applyToGlobe} onChange={(e) => setApplyToGlobe(e.target.checked)} className="accent-pleiad-300" />
              Use these qualities for the globe ranking after the run
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void onRun()}
                disabled={!provider || status === "running"}
                className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-space-950 hover:bg-amber-200 disabled:opacity-40"
              >
                {status === "running" ? "Running…" : "Run discovery"}
              </button>
              {candidates.length > 0 && (
                <button type="button" onClick={clear} className="rounded-full px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                  Remove all candidates ({candidates.length})
                </button>
              )}
            </div>
          </section>

          <div aria-live="polite" className="space-y-2">
            {error && (
              <p role="alert" className="text-xs text-rose-300">
                {error}
              </p>
            )}
            {problems.length > 0 && (
              <details className="rounded-lg border border-rose-300/30 p-2.5 text-xs text-rose-100">
                <summary>{problems.length} candidate(s) rejected by validation</summary>
                <ul className="mt-1 list-disc pl-4">
                  {problems.map((p, i) => (
                    <li key={i}>
                      {p.siteId}: {p.problem}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {lastRun && (
              <p className="text-xs text-slate-400">
                Last run: {lastRun.providerName}, {lastRun.count} candidate{lastRun.count === 1 ? "" : "s"} for {TARGET_LABEL[lastRun.query.target]}
                {lastRun.query.qualityIds.length > 0 && ` (${lastRun.query.qualityIds.map((q) => QUALITY_BY_ID.get(q)?.label ?? q).join(", ")})`}.
              </p>
            )}
          </div>

          {targetCandidates.length > 0 && (
            <section aria-labelledby="dr-title">
              <h3 id="dr-title" className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Candidates on the globe
              </h3>
              <ul className="space-y-2">
                {targetCandidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelectSite(c.id);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-left hover:border-amber-300/60"
                    >
                      <PinIcon origin="hypatia_candidate" scale={0.55} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{c.name}</span>
                        <span className="block text-[11px] text-slate-400">
                          {c.country} · {c.discovery?.status.replace(/_/g, " ")}
                        </span>
                      </span>
                      <span className="w-24 shrink-0 text-right text-[11px] text-slate-300">
                        Confidence {Math.round((c.discovery?.confidence ?? 0) * 100)}%
                        <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-space-700">
                          <span className="block h-full bg-amber-300" style={{ width: `${(c.discovery?.confidence ?? 0) * 100}%` }} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">
                Candidates live only in this session. Confidence is the provider's own estimate, not a validation.
              </p>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
