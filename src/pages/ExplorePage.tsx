import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import FilterBar from "@/components/filters/FilterBar";
import RankingPanel from "@/components/filters/RankingPanel";
import SavedSearches from "@/components/filters/SavedSearches";
import DiscoverPanel from "@/components/discovery/DiscoverPanel";
import { useUi } from "@/store/ui";
import GlobeView from "@/components/globe/GlobeView";
import SitesOverlay from "@/components/globe/SitesOverlay";
import SitePanel, { type SiteRanking } from "@/components/site/SitePanel";
import { sitesForTarget } from "@/data/sites";
import { useAllSites } from "@/data/siteRegistry";
import { rankSites, relaxationHint } from "@/lib/ranking";
import { useFilters } from "@/store/filters";
import { useGlobeView } from "@/store/globeView";
import { useEngine } from "@/store/engine";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";
import { useUserData } from "@/store/userData";
import { TOURS } from "@/tour/steps";
import { TARGET_LABEL, isTarget, type Target } from "@/types/site";
import { tx } from "@/i18n";

const NO_SELECTION: string[] = [];
/** Site whose panel the guided tour opens: one with engine findings to show. */
const TOUR_SITE: Record<Target, string> = { mars: "atacama-yungay", moon: "haughton-crater" };

export default function ExplorePage() {
  const { target: param } = useParams();
  const target: Target | null = isTarget(param) ? param : null;
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedQualities = useFilters((s) => (target ? s.selected[target] : NO_SELECTION));
  const { toggle, clear, setSelected } = useFilters.getState();
  const signedIn = useSession((s) => s.status === "signedIn");
  const favourites = useUserData((s) => s.fav.favourites);
  const searches = useUserData((s) => s.searches);
  const focus = useGlobeView((s) => s.focus);
  const pendingSelect = useGlobeView((s) => s.pendingSelect);
  const { setCenter, setFocus, requestSelect } = useGlobeView.getState();

  const favouriteIds = useMemo(() => new Set(favourites.map((f) => f.siteId)), [favourites]);
  const allSites = useAllSites();
  const targetSites = useMemo(() => (target ? sitesForTarget(allSites, target) : []), [target, allSites]);
  const filtersActive = selectedQualities.length > 0;

  const ranking = useMemo(
    () => (target && filtersActive ? rankSites(targetSites, target, selectedQualities) : null),
    [target, targetSites, selectedQualities, filtersActive],
  );
  const focusIds = useMemo(() => (focus ? new Set(focus.siteIds) : null), [focus]);
  const visibleSites = useMemo(() => {
    const base = ranking ? ranking.map((r) => r.site) : targetSites;
    return focusIds ? base.filter((s) => focusIds.has(s.id)) : base;
  }, [ranking, targetSites, focusIds]);
  const ranks = useMemo(() => (ranking ? new Map(ranking.map((r) => [r.site.id, r.rank])) : null), [ranking]);
  const hint = useMemo(
    () => (target && ranking && ranking.length === 0 ? relaxationHint(targetSites, target, selectedQualities) : null),
    [ranking, target, targetSites, selectedQualities],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!target) return m;
    for (const s of targetSites) for (const sim of s.similarities) if (sim.target === target) m.set(sim.qualityId, (m.get(sim.qualityId) ?? 0) + 1);
    return m;
  }, [target, targetSites]);

  // A site opened from the Favourites panel: make sure it is visible, then select it.
  useEffect(() => {
    if (!pendingSelect || !target) return;
    const site = targetSites.find((s) => s.id === pendingSelect);
    if (site) {
      if (focusIds && !focusIds.has(site.id)) setFocus(null);
      if (ranking && !ranking.some((r) => r.site.id === site.id)) clear(target);
      setSelectedId(site.id);
    }
    requestSelect(null);
  }, [pendingSelect, target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the panel if its site is hidden by a filter or irrelevant to the new target.
  useEffect(() => {
    if (pendingSelect) return;
    if (selectedId && !visibleSites.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [visibleSites, selectedId, pendingSelect]);

  const close = useCallback(() => setSelectedId(null), []);

  // The guided tour opens a site's panel and the discovery panel to explain them, and closes
  // what it opened when it ends. null = no tour running on this page.
  const tourScene = useTour((s) => (s.active === "explore" ? (TOURS.explore[s.index]?.scene ?? "none") : null));
  const tourDrove = useRef(false);
  useEffect(() => {
    if (tourScene === null && !tourDrove.current) return;
    tourDrove.current = tourScene !== null;
    const demo = target ? (visibleSites.find((s) => s.id === TOUR_SITE[target]) ?? visibleSites[0]) : undefined;
    setSelectedId(tourScene === "site" && demo ? demo.id : null);
    useUi.getState().setDiscoverOpen(tourScene === "discover");
  }, [tourScene]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the engine's data (site findings, mission regions) and, on a first visit, start the tour.
  useEffect(() => {
    void useEngine.getState().load();
    useTour.getState().startIfFirstVisit("explore");
  }, []);

  if (!target) return <Navigate to="/targets" replace />;

  const selected = visibleSites.find((s) => s.id === selectedId) ?? null;
  const ranked = ranking?.find((r) => r.site.id === selectedId);
  const siteRanking: SiteRanking | null = ranked ? { rank: ranked.rank, total: ranking!.length, score: ranked.score, matched: ranked.matched } : null;
  const focusHidden = focus ? focus.siteIds.filter((id) => !targetSites.some((s) => s.id === id)).length : 0;

  return (
    <div className="absolute inset-0 flex flex-col overflow-clip">
      <FilterBar
        target={target}
        selected={selectedQualities}
        onToggle={(id) => toggle(target, id)}
        onClear={() => clear(target)}
        matchCount={ranking ? ranking.length : null}
        totalCount={targetSites.length}
        counts={counts}
        onDiscover={() => useUi.getState().setDiscoverOpen(true)}
        savedSearches={
          <SavedSearches
            signedIn={signedIn}
            target={target}
            selected={selectedQualities}
            searches={searches}
            onSave={(name) => void useUserData.getState().saveSearch(target, selectedQualities, name)}
            onLoad={(s) => {
              setSelected(s.target, s.qualityIds);
              if (s.target !== target) navigate(`/explore/${s.target}`);
            }}
            onDelete={(id) => void useUserData.getState().deleteSearch(id)}
          />
        }
      />
      {focus && (
        <div role="status" className="flex items-center gap-3 border-b border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
          <span aria-hidden="true">★</span>
          Showing favourites from “{focus.label}”: {focus.siteIds.length - focusHidden} on the {TARGET_LABEL[target]} globe
          {focusHidden > 0 && ` (${focusHidden} are ${target === "moon" ? "Mars" : "Moon"}-only analogs)`}.
          <button type="button" onClick={() => setFocus(null)} className="ml-auto rounded-full border border-amber-300/40 px-2.5 py-0.5 hover:bg-amber-300/20">
            Show all sites
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1" data-tour="globe">
        <GlobeView sites={visibleSites} selectedId={selectedId} onSelect={setSelectedId} ranks={ranks} favouriteIds={favouriteIds} onViewCenter={setCenter} />
        <div className="pointer-events-none absolute bottom-3 left-3 top-3 z-10 flex w-72 flex-col gap-3">
          {ranking && (
            <RankingPanel
              ranking={focusIds ? ranking.filter((r) => focusIds.has(r.site.id)) : ranking}
              selectedId={selectedId}
              onSelect={setSelectedId}
              hint={hint}
              onApplyHint={(id) => toggle(target, id)}
              favouriteIds={signedIn ? favouriteIds : undefined}
              onQuickSave={signedIn ? (siteId) => void useUserData.getState().saveFavourite(siteId, "", []) : undefined}
            />
          )}
          <SitesOverlay sites={visibleSites} selectedId={selectedId} onSelect={setSelectedId} listLabel={focus ? tx("Favourites shown") : ranking ? tx("All matches") : tx("Sites")} />
        </div>
        <SitePanel site={selected} target={target} onClose={close} ranking={siteRanking} />
        <DiscoverPanel target={target} onSelectSite={(id) => requestSelect(id)} />
      </div>
    </div>
  );
}
