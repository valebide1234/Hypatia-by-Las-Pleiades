import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PinIcon } from "@/components/globe/SitesOverlay";
import { QUALITY_BY_ID } from "@/data/qualities";
import { targetImagesFor } from "@/data/sites";
import { useSession } from "@/store/session";
import { useUserData } from "@/store/userData";
import SaveFavouriteDialog from "@/components/favourites/SaveFavouriteDialog";
import { ORIGIN_LABEL, TARGET_LABEL, type AnalogSite, type SiteOrigin, type Strength, type Target } from "@/types/site";
import ImageComparison from "./ImageComparison";
import { MOCK_PROVIDER_ID } from "@/discovery/mockProvider";
import StrengthBadge from "./StrengthBadge";
import { REFERENCE_ORDER, formatCoord, limitationsFor, similaritiesFor } from "./siteDetails";

const BADGE_CLASS: Record<SiteOrigin, string> = {
  nasa_official: "border-sky-300/40 bg-sky-300/10 text-sky-100",
  literature: "border-slate-300/40 bg-slate-300/10 text-slate-100",
  hypatia_candidate: "border-amber-300/50 bg-amber-300/15 text-amber-100",
};

const REF_LABEL = { nasa: "NASA", peer_reviewed: "Peer-reviewed", other: "Other" } as const;

/** Filled in by the ranking (Phase 5) when filters are active. */
export interface SiteRanking {
  rank: number;
  total: number;
  score: number;
  matched: { qualityId: string; strength: Strength }[];
}

interface Props {
  site: AnalogSite | null;
  target: Target;
  onClose: () => void;
  ranking?: SiteRanking | null;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section aria-labelledby={hid} id={id} className="scroll-mt-4">
      <h3 id={hid} className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function qualityLabel(id: string) {
  return QUALITY_BY_ID.get(id)?.label ?? id;
}

function FavouriteButton({ siteId, siteName }: { siteId: string; siteName: string }) {
  const status = useSession((s) => s.status);
  const isFavourite = useUserData((s) => s.fav.favourites.some((f) => f.siteId === siteId));
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [siteId]);

  if (status !== "signedIn") {
    return (
      <div className="relative">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:border-white/40"
          aria-expanded={open}
          onClick={() => setOpen((p) => !p)}
        >
          <span aria-hidden="true">☆</span> Add to favourites
        </button>
        {open && (
          <div role="dialog" aria-label="Sign in to save favourites" className="glass absolute left-0 top-full z-10 mt-2 w-64 !bg-space-900/95 p-3 text-xs text-slate-300">
            <p className="font-medium text-white">Sign in to save favourites</p>
            <p className="mt-1">Guest sessions aren't stored. Create a free account to save sites into folders.</p>
            <div className="mt-3 flex gap-2">
              <Link to="/auth" className="rounded-full bg-pleiad-300 px-3 py-1 font-medium text-space-950 hover:bg-white">
                Log in
              </Link>
              <Link to="/auth?mode=signup" className="rounded-full border border-white/20 px-3 py-1 hover:border-white/50">
                Sign up
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${isFavourite ? "border-amber-300/60 bg-amber-300/15 text-amber-100" : "border-white/15 text-slate-200 hover:border-white/40"}`}
      >
        <span aria-hidden="true">{isFavourite ? "★" : "☆"}</span>
        {isFavourite ? "In favourites" : "Add to favourites"}
      </button>
      {open && <SaveFavouriteDialog siteId={siteId} siteName={siteName} onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function SitePanel({ site, target, onClose, ranking }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const limitationsId = useId();

  useEffect(() => {
    if (!site) return;
    closeRef.current?.focus({ preventScroll: true });
    scrollRef.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [site, onClose]);

  const sims = site ? similaritiesFor(site, target) : [];
  const lims = site ? limitationsFor(site, target) : [];
  const matchedIds = new Set(ranking?.matched.map((m) => m.qualityId));
  const otherTarget = site?.targets.find((t) => t !== target);
  const refs = site ? [...site.references].sort((a, b) => REFERENCE_ORDER[a.type] - REFERENCE_ORDER[b.type]) : [];

  return (
    <aside
      aria-label="Site details"
      aria-hidden={!site}
      className={`glass absolute bottom-3 right-3 top-3 z-10 flex w-[min(34rem,calc(100%-1.5rem))] flex-col overflow-clip transition-transform duration-300 motion-reduce:transition-none ${site ? "translate-x-0" : "pointer-events-none translate-x-[110%]"}`}
    >
      {site && (
        <>
          <header className="relative z-20 border-b border-white/10 p-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium ${BADGE_CLASS[site.origin]}`}>
                  <PinIcon origin={site.origin} scale={0.4} />
                  {ORIGIN_LABEL[site.origin]}
                </span>
                <h2 className="mt-2 font-display text-[1.7rem] leading-tight text-white">{site.name}</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {site.country} · <span className="tabular-nums">{formatCoord(site.lat, site.lon)}</span>
                </p>
                {site.programs.length > 0 && <p className="mt-1 text-xs text-slate-300">{site.programs.join(" · ")}</p>}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close site details"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FavouriteButton siteId={site.id} siteName={site.name} />
              {lims.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Scroll only the panel body (scrollIntoView would also scroll the clipped panel itself).
                    const el = document.getElementById(limitationsId);
                    const body = scrollRef.current;
                    if (!el || !body) return;
                    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    body.scrollTo({ top: el.offsetTop - 16, behavior: smooth ? "smooth" : "auto" });
                    el.focus({ preventScroll: true });
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100 hover:border-amber-300/70"
                >
                  <span aria-hidden="true">⚠</span> {lims.length} limitation{lims.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </header>

          <div ref={scrollRef} className="relative flex-1 space-y-6 overflow-y-auto p-5 text-sm text-slate-300">
            {site.origin === "hypatia_candidate" && (
              <div role="note" className="rounded-xl border border-amber-300/50 bg-amber-300/10 p-3 text-xs text-amber-100">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  Hypatia candidate, {site.discovery?.status.replace(/_/g, " ") ?? "unverified"}
                  {site.discovery?.providerId === MOCK_PROVIDER_ID && (
                    <span className="rounded border border-rose-300/60 bg-rose-300/20 px-1.5 text-[10px] uppercase tracking-wider text-rose-100">Test data</span>
                  )}
                </p>
                <p className="mt-1">
                  Proposed by an automated discovery method, not recognised by any space agency.
                  {site.discovery && (
                    <>
                      {" "}Confidence {Math.round(site.discovery.confidence * 100)}% ({site.discovery.method}). Datasets: {site.discovery.datasetsUsed.join(", ")}.
                    </>
                  )}
                </p>
              </div>
            )}

            {ranking && (
              <div className="rounded-xl border border-pleiad-300/30 bg-pleiad-300/[0.07] p-3">
                <p className="text-xs text-slate-300">
                  <span className="font-display text-2xl text-white">#{ranking.rank}</span> of {ranking.total} matches · score{" "}
                  <span className="tabular-nums text-white">{ranking.score.toFixed(1)}</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Matched qualities">
                  {ranking.matched.map((m) => (
                    <li key={m.qualityId} className="flex items-center gap-1.5 rounded-full bg-space-800 py-0.5 pl-2.5 pr-1 text-[11px] text-slate-200">
                      {qualityLabel(m.qualityId)} <StrengthBadge strength={m.strength} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="leading-relaxed">{site.summary}</p>

            <Section title={`Earth vs. ${TARGET_LABEL[target]}`}>
              <ImageComparison
                key={`${site.id}:${target}`}
                earth={site.images.earth}
                target={targetImagesFor(site, target)}
                targetLabel={TARGET_LABEL[target]}
              />
            </Section>

            <Section title={`Why it's a ${TARGET_LABEL[target]} analog`}>
              <ul className="space-y-3">
                {sims.map((s) => {
                  const q = QUALITY_BY_ID.get(s.qualityId);
                  const matched = matchedIds.has(s.qualityId);
                  return (
                    <li key={s.qualityId} className={`rounded-lg p-2.5 ${matched ? "bg-pleiad-300/10 ring-1 ring-pleiad-300/40" : "bg-white/[0.03]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-white" title={q?.description}>
                          {q?.label ?? s.qualityId}
                          {matched && <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-pleiad-300">Matches filter</span>}
                        </span>
                        <StrengthBadge strength={s.strength} />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{s.explanation}</p>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <section id={limitationsId} tabIndex={-1} aria-labelledby={`${limitationsId}-h`} className="scroll-mt-4 outline-none rounded-xl border border-amber-300/40 bg-amber-300/[0.06] p-4">
              <h3 id={`${limitationsId}-h`} className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                <span aria-hidden="true">⚠</span> Limitations: where the analog breaks down
              </h3>
              <ul className="mt-3 space-y-2.5">
                {lims.map((l, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-amber-50/90">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                    <span>
                      {l.qualityId && (
                        <span className="mr-1.5 inline-block rounded border border-amber-300/40 px-1.5 text-[10px] uppercase tracking-wider text-amber-200">
                          Not {qualityLabel(l.qualityId)}
                        </span>
                      )}
                      {l.explanation}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {site.researchUse.length > 0 && (
              <Section title="Research use">
                <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed marker:text-slate-500">
                  {site.researchUse.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="References">
              {refs.length === 0 && (
                <p className="text-xs text-slate-500">
                  No references yet.{site.origin === "hypatia_candidate" ? " This candidate has not been confirmed by any published study." : ""}
                </p>
              )}
              <ul className="space-y-2">
                {refs.map((r) => (
                  <li key={r.url} className="flex gap-2 text-xs leading-relaxed">
                    <span className="mt-0.5 w-[5.5rem] shrink-0 rounded border border-white/15 px-1.5 text-center text-[10px] uppercase tracking-wider text-slate-400">
                      {REF_LABEL[r.type]}
                    </span>
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
                      {r.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>

            {otherTarget && (
              <p className="border-t border-white/10 pt-4 text-xs text-slate-500">
                This site is also an analog for {otherTarget === "moon" ? "the Moon" : "Mars"}. Switch the target in the top bar to see that comparison.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
