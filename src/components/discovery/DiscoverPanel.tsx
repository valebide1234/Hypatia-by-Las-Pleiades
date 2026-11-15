import { useEffect, useMemo, useRef, useState } from "react";
import QualityPicker from "@/components/filters/QualityPicker";
import { PinIcon } from "@/components/globe/SitesOverlay";
import StrengthBadge from "@/components/site/StrengthBadge";
import { QUALITY_BY_ID } from "@/data/qualities";
import { SITES } from "@/data/sites";
import { ENGINE_PROVIDER_ID, measurableFor, newUsesFor, regionsFor } from "@/discovery/engine/buildCandidates";
import { getDiscoveryProviders } from "@/discovery/registry";
import { useDiscovery } from "@/store/discovery";
import { useEngine } from "@/store/engine";
import { useFilters } from "@/store/filters";
import { useUi } from "@/store/ui";
import { TARGET_LABEL, type Target } from "@/types/site";
import EngineStatus from "./EngineStatus";
import { proposalsFor } from "@/discovery/engine/proposals";
import { pick, translate, useLang, useT } from "@/i18n";
import { useLab } from "@/lab/store";

interface Props {
  target: Target;
  onSelectSite: (siteId: string) => void;
}

const label = (id: string) => translate(useLang.getState().lang, QUALITY_BY_ID.get(id)?.label ?? id);

/**
 * "Discover new analogs": runs a discovery provider (by default the Hypatia engine) for the
 * chosen qualities and mission need, and puts the validated candidates on the globe.
 */
export default function DiscoverPanel({ target, onSelectSite }: Props) {
  const t = useT();
  const open = useUi((s) => s.discoverOpen);
  const setOpen = useUi((s) => s.setDiscoverOpen);
  const globeQualities = useFilters((s) => s.selected[target]);
  const providers = useMemo(() => getDiscoveryProviders(), []);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [qualityIds, setQualityIds] = useState<string[]>([]);
  const [missionRegionId, setMissionRegionId] = useState("");
  const [preferNewData, setPreferNewData] = useState(false);
  const [applyToGlobe, setApplyToGlobe] = useState(true);
  const { status, error, problems, lastRun, candidates, run, clear } = useDiscovery();
  const dataset = useEngine((s) => s.dataset);
  const closeRef = useRef<HTMLButtonElement>(null);
  const provider = providers.find((p) => p.id === providerId);
  const isEngine = providerId === ENGINE_PROVIDER_ID;
  const targetCandidates = candidates.filter((c) => c.targets.includes(target));

  const regions = useMemo(() => (dataset ? regionsFor(dataset, target) : []), [dataset, target]);
  const programs = useMemo(() => [...new Set(regions.map((r) => r.program))], [regions]);
  const region = regions.find((r) => r.id === missionRegionId);
  const measurable = useMemo(() => new Set(dataset ? measurableFor(dataset, target) : []), [dataset, target]);
  const notMeasurable = isEngine && dataset ? qualityIds.filter((q) => !measurable.has(q)) : [];
  const usable = isEngine && dataset ? qualityIds.filter((q) => measurable.has(q)) : qualityIds;
  const lang = useLang((s) => s.lang);
  const proposals = useMemo(() => proposalsFor(dataset, target), [dataset, target]);
  const newUses = useMemo(() => (dataset && isEngine ? newUsesFor(dataset, target, usable) : []), [dataset, isEngine, target, usable]);

  // Start from the globe's current filters each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setQualityIds(globeQualities);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // A mission region belongs to one target. Coming from the Lab, start from the region chosen there.
  const discoverRegion = useUi((s) => s.discoverRegion);
  useEffect(() => {
    setMissionRegionId(regions.some((r) => r.id === discoverRegion) ? discoverRegion : "");
  }, [target, discoverRegion, regions]);

  if (!open) return null;

  const onRun = async () => {
    if (!provider) return;
    await run(provider, { target, qualityIds, missionRegionId: missionRegionId || undefined, preferNewData });
    // The Lab follows: the same body and mission region are selected there.
    useLab.getState().select(missionRegionId ? { target, regionId: missionRegionId } : { target });
    // Candidates only claim what the engine can measure, so only those qualities are applied.
    if (applyToGlobe) useFilters.getState().setSelected(target, usable);
  };

  const select = (siteId: string) => {
    setOpen(false);
    onSelectSite(siteId);
  };

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-space-950/40" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="discover-title" className="glass m-3 flex w-[min(40rem,calc(100%-1.5rem))] flex-col overflow-hidden !bg-space-900/95">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 id="discover-title" className="font-display text-2xl text-white">
            {target === "moon" ? t("Discover new Moon analogs") : t("Discover new Mars analogs")}
          </h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("Close discovery panel")} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm text-slate-300">
          <EngineStatus />

          <section aria-labelledby="dq-title" data-tour="discover-qualities">
            <h3 id="dq-title" className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              {t("What do you want to study?")}
            </h3>
            <QualityPicker
              target={target}
              selected={qualityIds}
              onToggle={(id) => setQualityIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            />
            {isEngine && dataset && (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                {t("From satellite and reanalysis data the engine can assess:")}{" "}
                <span className="text-slate-200">{[...measurable].map(label).join(", ")}</span>. {t("It retrieves no geology, so it never claims a rock type, a mineral or a landform.")}
              </p>
            )}
            {notMeasurable.length > 0 && (
              <p role="note" className="mt-2 rounded-lg border border-white/15 bg-white/[0.03] p-2.5 text-xs text-slate-300">
                {t("Not measurable from the engine's data, so ignored for this search:")} <strong>{notMeasurable.map(label).join(", ")}</strong>.{" "}
                {t("Candidates will not claim them; verify in the field.")}
              </p>
            )}
          </section>

          {isEngine && (
            <section aria-labelledby="dm-title" className="space-y-2" data-tour="discover-mission">
              <h3 id="dm-title" className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t("Mission need (optional)")}
              </h3>
              <select
                value={missionRegionId}
                onChange={(e) => setMissionRegionId(e.target.value)}
                disabled={!dataset}
                className="field !py-1.5 !text-xs"
                aria-label={t("Mission region to compare with")}
              >
                <option value="">{target === "moon" ? t("Any Moon region") : t("Any Mars region")}</option>
                {programs.map((p) => (
                  <optgroup key={p} label={p}>
                    {regions
                      .filter((r) => r.program === p)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {t(r.name)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs leading-relaxed text-slate-400">
                {region
                  ? `${t(region.summary)} ${t("The search returns the places on Earth whose measured environment and terrain are closest to it.")}`
                  : t("Pick where the mission is going to find the places on Earth whose measured environment and terrain are closest to that region.")}
              </p>
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={preferNewData} onChange={(e) => setPreferNewData(e.target.checked)} className="mt-0.5 accent-pleiad-300" />
                <span>
                  {t("Put first the places that the newest data strengthen")}
                  {dataset?.windows.recent && <span className="text-slate-500"> ({t("{recent} against {earlier}", { recent: dataset.windows.recent, earlier: dataset.windows.earlier ?? "" })})</span>}
                </span>
              </label>
            </section>
          )}

          <section aria-labelledby="dp-title" className="space-y-2">
            {providers.length > 1 && (
              <>
                <h3 id="dp-title" className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {t("Provider")}
                </h3>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="field !w-auto !py-1.5 !text-xs" aria-label={t("Provider")}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {provider?.isTestData && (
              <p role="note" className="rounded-lg border border-rose-300/40 bg-rose-300/10 p-2.5 text-xs text-rose-100">
                <strong>TEST DATA.</strong> {t("This provider returns synthetic candidates to check the pipeline. They are not real analog proposals.")}
              </p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={applyToGlobe} onChange={(e) => setApplyToGlobe(e.target.checked)} className="accent-pleiad-300" />
              {t("Use these qualities for the globe ranking after the run")}
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                data-tour="discover-run"
                onClick={() => void onRun()}
                disabled={!provider || status === "running"}
                className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-space-950 hover:bg-amber-200 disabled:opacity-40"
              >
                {status === "running" ? t("Running…") : t("Run discovery")}
              </button>
              {candidates.length > 0 && (
                <button type="button" onClick={clear} className="rounded-full px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                  {t("Remove all candidates ({n})", { n: candidates.length })}
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
                <summary>{t("{n} candidate(s) rejected by validation", { n: problems.length })}</summary>
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
                {t("Last run: {n} candidate(s) for {body}", { n: lastRun.count, body: t(TARGET_LABEL[lastRun.query.target]) })}
                {lastRun.query.qualityIds.length > 0 && ` (${lastRun.query.qualityIds.map(label).join(", ")})`}.
                {lastRun.count === 0 && !lastRun.isTestData && ` ${t("No place outside the known analogs meets every measurable quality you selected; try fewer qualities or another mission region.")}`}
              </p>
            )}
          </div>

          {targetCandidates.length > 0 && (
            <section aria-labelledby="dr-title">
              <h3 id="dr-title" className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t("New places on the globe")}
              </h3>
              <ul className="space-y-2">
                {targetCandidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => select(c.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-left hover:border-amber-300/60"
                    >
                      <PinIcon origin="hypatia_candidate" scale={0.55} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{c.name}</span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {c.country} · {c.similarities.map((s) => label(s.qualityId)).join(", ")}
                        </span>
                      </span>
                      <span className="w-24 shrink-0 text-right text-[11px] text-slate-300">
                        {t("Confidence")} {Math.round((c.discovery?.confidence ?? 0) * 100)}%
                        <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-space-700">
                          <span className="block h-full bg-amber-300" style={{ width: `${(c.discovery?.confidence ?? 0) * 100}%` }} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("Candidates live only in this session; save one to favourites to keep it. Confidence is the provider's own estimate of its evidence, not a validation.")}
              </p>
            </section>
          )}

          {proposals.length > 0 && (
            <section aria-labelledby="dt-title">
              <h3 id="dt-title" className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t("Proposed by the team")}
              </h3>
              <p className="mb-2 text-xs leading-relaxed text-slate-400">
                {t("Places that Las Pléyades propose from their own research, each measured by the engine with NASA data. They are always on the globe as amber diamonds.")}
              </p>
              <ul className="space-y-1.5">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => select(p.id)} className="flex w-full items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.04] px-3 py-2 text-left hover:border-amber-300/60">
                      <PinIcon origin="hypatia_candidate" scale={0.45} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{p.name}</span>
                        <span className="block truncate text-[11px] text-slate-400">{p.country}</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">{t(p.status.replace(/_/g, " "))}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {(dataset?.declined ?? []).length > 0 && (
                <details className="mt-2 text-xs text-slate-400">
                  <summary className="cursor-pointer hover:text-white">{t("Proposed but not included")}</summary>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed">
                    {dataset!.declined!.map((d) => (
                      <li key={d.name}>
                        <strong className="text-slate-200">{d.name}.</strong> {pick(lang, d.reason)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          {newUses.length > 0 && (
            <section aria-labelledby="dn-title">
              <h3 id="dn-title" className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t("Known sites, new reasons")}
              </h3>
              <p className="mb-2 text-xs leading-relaxed text-slate-400">
                {t("Sites already in the catalogue where the data support a quality the catalogue does not list. Suggestions only: the catalogue and its ranking are not changed.")}
              </p>
              <ul className="space-y-1.5">
                {newUses.map(({ siteId, check }) => {
                  const site = SITES.find((s) => s.id === siteId);
                  if (!site) return null;
                  return (
                    <li key={`${siteId}:${check.qualityId}`}>
                      <button
                        type="button"
                        onClick={() => select(siteId)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-white/30"
                      >
                        <PinIcon origin={site.origin} scale={0.45} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{site.name}</span>
                          <span className="block truncate text-[11px] text-amber-100">{t("New reason")}: {label(check.qualityId)}</span>
                        </span>
                        {check.strength && <StrengthBadge strength={check.strength} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
