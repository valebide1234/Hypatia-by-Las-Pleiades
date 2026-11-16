import { useMemo } from "react";
import { pick, useLang, useT } from "@/i18n";
import { buildReport } from "@/lab/report";
import type { LabDataset } from "@/lab/types";
import { useSelection } from "@/lab/useSelection";
import Markdown from "./Markdown";
import { Card } from "./ui";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The ten-section scientific report of the selected pair, in the interface language. */
export default function ReportTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { places, place, region, objectiveId } = useSelection(ds);
  const report = useMemo(() => buildReport(ds, places, place, region, objectiveId, t, lang), [ds, places, place, region, objectiveId, t, lang]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hypatia-report-${slug(pick("en", place.name))}-${region.id}-${lang}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card tour="lab-report">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
          {t("Written from the engine's data for the pair, objective and language you have selected. Every number in it is in the Compare tab; nothing is typed by hand for a particular pair.")}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="rounded-full bg-pleiad-300 px-4 py-1.5 text-xs font-semibold text-space-950 hover:bg-white">
            {t("Download (.md)")}
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-200 hover:border-white/50">
            {t("Print")}
          </button>
        </div>
      </div>
      <article className="mx-auto max-w-4xl">
        <Markdown source={report} />
      </article>
    </Card>
  );
}
