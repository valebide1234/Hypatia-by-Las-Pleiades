import { useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import Popover from "@/components/common/Popover";
import QualityPicker from "@/components/filters/QualityPicker";
import { PinIcon } from "@/components/globe/SitesOverlay";
import { QUALITY_BY_ID } from "@/data/qualities";
import { useAllSites } from "@/data/siteRegistry";
import {
  DEFAULT_CRITERIA,
  filterFavourites,
  sortFavourites,
  type FavCriteria,
  type FavEntry,
  type FavSort,
} from "@/lib/favourites";
import { useFilters } from "@/store/filters";
import { useGlobeView } from "@/store/globeView";
import { useUi } from "@/store/ui";
import { useUserData } from "@/store/userData";
import { ORIGIN_LABEL, isTarget, type SiteOrigin, type Target } from "@/types/site";
import FavouriteCard from "./FavouriteCard";
import FolderSidebar from "./FolderSidebar";

const ORIGINS: SiteOrigin[] = ["nasa_official", "literature", "hypatia_candidate"];
const SORT_LABEL: Record<FavSort, string> = { date: "Date saved", name: "Name", score: "Ranking score", distance: "Distance from view" };

/** Favourites panel (signed-in users): folders, search, filters, sorting and "Show on globe". */
export default function FavouritesDrawer() {
  const open = useUi((s) => s.favouritesOpen);
  const setOpen = useUi((s) => s.setFavouritesOpen);
  const fav = useUserData((s) => s.fav);
  const status = useUserData((s) => s.status);
  const error = useUserData((s) => s.error);
  const repoKind = useUserData((s) => s.repo?.kind);
  const { moveFavourite, copyFavourite } = useUserData.getState();
  const routeTarget = useMatch("/explore/:target")?.params.target;
  const globeTarget: Target = isTarget(routeTarget) ? routeTarget : "mars";
  const globeQualities = useFilters((s) => s.selected[globeTarget]);
  const viewCenter = useGlobeView((s) => s.center);
  const { setFocus, requestSelect } = useGlobeView.getState();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  const allSites = useAllSites();
  const [criteria, setCriteria] = useState<FavCriteria>(DEFAULT_CRITERIA);
  const [sort, setSort] = useState<FavSort>("date");
  const set = (patch: Partial<FavCriteria>) => setCriteria((c) => ({ ...c, ...patch }));

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // A deleted folder can't stay selected.
  useEffect(() => {
    if (!["all", "unfiled"].includes(criteria.folder) && !fav.folders.some((f) => f.id === criteria.folder)) set({ folder: "all" });
  }, [fav.folders, criteria.folder]);

  const entries: FavEntry[] = useMemo(() => fav.favourites.map((f) => ({ favourite: f, site: allSites.find((s) => s.id === f.siteId) })), [fav.favourites, allSites]);
  const countries = useMemo(() => [...new Set(entries.map((e) => e.site?.country).filter((c): c is string => Boolean(c)))].sort(), [entries]);
  const shown = useMemo(
    () => sortFavourites(filterFavourites(fav, entries, criteria), sort, { target: criteria.target === "both" ? globeTarget : criteria.target, qualityIds: globeQualities, viewCenter }),
    [fav, entries, criteria, sort, globeTarget, globeQualities, viewCenter],
  );

  if (!open) return null;

  const folderName =
    criteria.folder === "all" ? "All favourites" : criteria.folder === "unfiled" ? "Unfiled" : fav.folders.find((f) => f.id === criteria.folder)?.name ?? "Folder";
  const filtersActive =
    criteria.text || criteria.target !== "both" || criteria.origins.length || criteria.qualityIds.length || criteria.countries.length;

  const targetFor = (siteId: string): Target | null => {
    const site = allSites.find((s) => s.id === siteId);
    if (!site) return null;
    if (isTarget(routeTarget) && site.targets.includes(routeTarget)) return routeTarget;
    if (criteria.target !== "both" && site.targets.includes(criteria.target)) return criteria.target;
    return site.targets[0] ?? null;
  };

  const openSite = (siteId: string) => {
    const t = targetFor(siteId);
    if (!t) return;
    requestSelect(siteId);
    setOpen(false);
    navigate(`/explore/${t}`);
  };

  const showOnGlobe = () => {
    const ids = shown.map((e) => e.site?.id).filter((x): x is string => Boolean(x));
    if (!ids.length) return;
    const t: Target = criteria.target !== "both" ? criteria.target : isTarget(routeTarget) ? routeTarget : (shown.find((e) => e.site)?.site?.targets[0] ?? "mars");
    setFocus({ siteIds: ids, label: filtersActive ? `${folderName} (filtered)` : folderName });
    setOpen(false);
    navigate(`/explore/${t}`);
  };

  const onDropFavourite = (favouriteId: string, toFolderId: string | null, copy: boolean) => {
    const from = criteria.folder !== "all" && criteria.folder !== "unfiled" ? criteria.folder : null;
    if (copy && toFolderId) void copyFavourite(favouriteId, toFolderId);
    else void moveFavourite(favouriteId, from, toFolderId);
  };

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-space-950/40" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="fav-title" className="glass m-3 flex w-[min(60rem,calc(100%-1.5rem))] flex-col overflow-hidden !bg-space-900/95">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div>
            <h2 id="fav-title" className="font-display text-2xl text-white">
              Favourites
            </h2>
            {repoKind === "local-demo" && <p className="text-[11px] text-amber-200">Demo account: stored only in this browser (Supabase not configured).</p>}
          </div>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close favourites" className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {error && (
          <p role="alert" className="border-b border-rose-300/30 bg-rose-300/10 px-5 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[15rem,1fr]">
          <div className="hidden min-h-0 border-r border-white/10 md:flex md:flex-col">
            <FolderSidebar fav={fav} view={criteria.folder} onView={(folder) => set({ folder })} onDropFavourite={onDropFavourite} />
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="space-y-2 border-b border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only md:hidden" htmlFor="fav-folder">
                  Folder
                </label>
                <select id="fav-folder" value={criteria.folder} onChange={(e) => set({ folder: e.target.value })} className="field !w-auto !py-1.5 !text-xs md:hidden">
                  <option value="all">All favourites</option>
                  <option value="unfiled">Unfiled</option>
                  {fav.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="fav-search">
                  Search favourites
                </label>
                <input
                  id="fav-search"
                  type="search"
                  value={criteria.text}
                  onChange={(e) => set({ text: e.target.value })}
                  placeholder="Search name, country or note…"
                  className="field !w-auto min-w-[12rem] flex-1 !py-1.5 !text-xs"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  Sort
                  <select value={sort} onChange={(e) => setSort(e.target.value as FavSort)} className="field !w-auto !py-1.5 !text-xs">
                    {(Object.keys(SORT_LABEL) as FavSort[]).map((k) => (
                      <option key={k} value={k} disabled={k === "distance" && !viewCenter}>
                        {SORT_LABEL[k]}
                        {k === "score" && globeQualities.length === 0 ? " (no globe filters)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={showOnGlobe}
                  disabled={!shown.some((e) => e.site)}
                  className="rounded-full bg-pleiad-300 px-3 py-1.5 text-xs font-semibold text-space-950 hover:bg-white disabled:opacity-40"
                >
                  Show on globe
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <div role="radiogroup" aria-label="Target" className="flex rounded-full bg-space-800 p-0.5">
                  {(["both", "moon", "mars"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={criteria.target === t}
                      onClick={() => set({ target: t, qualityIds: [] })}
                      className={`rounded-full px-2.5 py-1 ${criteria.target === t ? "bg-pleiad-300 font-medium text-space-950" : "text-slate-300 hover:text-white"}`}
                    >
                      {t === "both" ? "Moon & Mars" : t === "moon" ? "Moon" : "Mars"}
                    </button>
                  ))}
                </div>
                {ORIGINS.map((o) => {
                  const on = criteria.origins.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ origins: on ? criteria.origins.filter((x) => x !== o) : [...criteria.origins, o] })}
                      className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2.5 ${on ? "border-pleiad-300 bg-pleiad-300/15 text-white" : "border-white/15 text-slate-300 hover:border-white/40"}`}
                    >
                      <PinIcon origin={o} scale={0.4} />
                      {ORIGIN_LABEL[o]}
                    </button>
                  );
                })}
                <Popover
                  label="Filter favourites by quality"
                  className="max-h-[60vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto"
                  trigger={(p) => (
                    <button {...p} type="button" className="rounded-full border border-white/15 px-2.5 py-1 text-slate-300 hover:border-white/40">
                      Qualities{criteria.qualityIds.length ? ` (${criteria.qualityIds.length})` : ""} ▾
                    </button>
                  )}
                >
                  <QualityPicker
                    target={criteria.target}
                    selected={criteria.qualityIds}
                    onToggle={(id) => set({ qualityIds: criteria.qualityIds.includes(id) ? criteria.qualityIds.filter((x) => x !== id) : [...criteria.qualityIds, id] })}
                  />
                </Popover>
                <label className="sr-only" htmlFor="fav-country">
                  Country or region
                </label>
                <select
                  id="fav-country"
                  value={criteria.countries[0] ?? ""}
                  onChange={(e) => set({ countries: e.target.value ? [e.target.value] : [] })}
                  className="field !w-auto !py-1 !text-xs"
                >
                  <option value="">Any country/region</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {filtersActive ? (
                  <button type="button" onClick={() => setCriteria({ ...DEFAULT_CRITERIA, folder: criteria.folder })} className="rounded-full px-2 py-1 text-slate-400 hover:text-white">
                    Reset filters
                  </button>
                ) : null}
              </div>
              {criteria.qualityIds.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  Qualities: {criteria.qualityIds.map((q) => QUALITY_BY_ID.get(q)?.label ?? q).join(", ")} (same matching rules as the globe; limitations exclude).
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-widest text-slate-400">
                {folderName}
                <span className="font-normal normal-case tracking-normal text-slate-500" aria-live="polite">
                  {shown.length} of {criteria.folder === "all" ? fav.favourites.length : filterFavourites(fav, entries, { ...DEFAULT_CRITERIA, folder: criteria.folder }).length}
                </span>
              </h3>
              {status === "loading" && <p className="text-sm text-slate-400">Loading your favourites…</p>}
              {status === "ready" && fav.favourites.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
                  No favourites yet. Open a site on the globe and choose “☆ Add to favourites”.
                </p>
              )}
              {status === "ready" && fav.favourites.length > 0 && shown.length === 0 && <p className="text-sm text-slate-400">Nothing matches these filters.</p>}
              <ul className="space-y-2">
                {shown.map((e) => (
                  <FavouriteCard key={e.favourite.id} entry={e} fav={fav} view={criteria.folder} onOpen={openSite} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
