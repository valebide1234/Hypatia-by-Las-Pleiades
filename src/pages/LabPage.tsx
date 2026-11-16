import { useEffect, useMemo, useState } from "react";
import AboutTab from "@/components/lab/AboutTab";
import ApplicationsTab from "@/components/lab/ApplicationsTab";
import AssistantTab from "@/components/lab/AssistantTab";
import CompareTab from "@/components/lab/CompareTab";
import LabSelection from "@/components/lab/LabSelection";
import ModelTab from "@/components/lab/ModelTab";
import RegionsTab from "@/components/lab/RegionsTab";
import ReportTab from "@/components/lab/ReportTab";
import SourcesTab from "@/components/lab/SourcesTab";
import { tx, useT } from "@/i18n";
import { useLab, withCustomObjective } from "@/lab/store";
import { useTour } from "@/store/tour";

const TABS = [
  { id: "compare", label: tx("Compare"), needsPair: true },
  { id: "regions", label: tx("Mission regions"), needsPair: true },
  { id: "report", label: tx("Report"), needsPair: true },
  { id: "model", label: tx("Machine learning"), needsPair: true },
  { id: "applications", label: tx("Applications"), needsPair: true },
  { id: "assistant", label: tx("Assistant"), needsPair: false },
  { id: "sources", label: tx("Sources and method"), needsPair: false },
  { id: "about", label: tx("About"), needsPair: false },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * The Lab: the engine's full analysis for any pair of an Earth place and a mission region.
 * Everything is computed in the browser from public/engine/lab.json.
 */
export default function LabPage() {
  const t = useT();
  const { dataset: loaded, status, error, load, weights } = useLab();
  // The user's own weights are one more objective, available to every view.
  const dataset = useMemo(() => (loaded ? withCustomObjective(loaded, weights) : null), [loaded, weights]);
  const [tab, setTab] = useState<TabId>("compare");
  const current = TABS.find((x) => x.id === tab)!;

  useEffect(() => {
    void load();
  }, [load]);
  // The tour points at things of the Compare tab, so it starts once the data are on screen.
  useEffect(() => {
    if (dataset) useTour.getState().startIfFirstVisit("lab");
  }, [dataset]);
  const tourRunning = useTour((s) => s.active === "lab");
  useEffect(() => {
    if (tourRunning) setTab("compare");
  }, [tourRunning]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <header>
          <h1 className="font-display text-4xl text-white">{t("Lab")}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            {t("Open up any comparison between a place on Earth and a region of the Moon or Mars: every parameter, the full report, the machine-learning map, what the pair can be used for, and where each value came from.")}
          </p>
        </header>

        <div role="tablist" aria-label={t("Lab views")} data-tour="lab-tabs" className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-space-900/70 p-1">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`lab-tab-${x.id}`}
              aria-selected={tab === x.id}
              aria-controls="lab-panel"
              onClick={() => setTab(x.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs transition-colors ${tab === x.id ? "bg-pleiad-300 font-semibold text-space-950" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
            >
              {t(x.label)}
            </button>
          ))}
        </div>

        {status === "loading" && <p className="text-sm text-slate-400">{t("Loading the engine's data…")}</p>}
        {status === "error" && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}

        {dataset && (
          <>
            {current.needsPair && <LabSelection ds={dataset} />}
            <div role="tabpanel" id="lab-panel" aria-labelledby={`lab-tab-${tab}`}>
              {tab === "compare" && <CompareTab ds={dataset} />}
              {tab === "regions" && <RegionsTab ds={dataset} onCompare={() => setTab("compare")} />}
              {tab === "report" && <ReportTab ds={dataset} />}
              {tab === "model" && <ModelTab ds={dataset} />}
              {tab === "applications" && <ApplicationsTab ds={dataset} />}
              {tab === "assistant" && <AssistantTab ds={dataset} />}
              {tab === "sources" && <SourcesTab ds={dataset} />}
              {tab === "about" && <AboutTab ds={dataset} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
