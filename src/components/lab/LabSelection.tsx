import { pick, useLang, useT } from "@/i18n";
import { CUSTOM_OBJECTIVE, allPlaces, useLab } from "@/lab/store";
import type { LabDataset } from "@/lab/types";
import { TARGETS, TARGET_LABEL } from "@/types/site";

/** The pair being studied: where on Earth, which mission region, and for what purpose. */
export default function LabSelection({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { target, placeId, regionId, objectiveId, select, userPlaces, candidatePlaces, weights, setWeight } = useLab();
  const places = allPlaces(ds, userPlaces, candidatePlaces);
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const regions = ds.regions.filter((r) => r.target === target);
  const programs = [...new Set(regions.map((r) => r.program))];
  const groups = [
    { id: "catalogue", label: t("Hypatia's catalogue") },
    { id: "proposal", label: t("Proposed by the team") },
    { id: "candidate", label: t("New candidates you opened") },
    { id: "reference", label: t("Engine reference sites (not yet in the catalogue)") },
    { id: "user", label: t("Your places") },
  ] as const;
  const byName = (a: { name: { en: string } }, b: { name: { en: string } }) => pick(lang, a.name).localeCompare(pick(lang, b.name));

  return (
    <div data-tour="lab-selection" className="glass grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr]">
      <div className="flex flex-col gap-1 text-xs text-slate-400">
        {t("Target")}
        <div role="radiogroup" aria-label={t("Target")} className="flex rounded-full border border-white/15 bg-space-800 p-0.5 text-xs">
          {TARGETS.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={target === x}
              onClick={() => select({ target: x })}
              className={`rounded-full px-3 py-1.5 transition-colors ${target === x ? "bg-pleiad-300 font-medium text-space-950" : "text-slate-300 hover:text-white"}`}
            >
              {t(TARGET_LABEL[x])}
            </button>
          ))}
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
        {t("Place on Earth")}
        <select className="field !py-1.5 !text-xs" value={placeId} onChange={(e) => select({ placeId: e.target.value })}>
          {groups.map((g) => {
            const items = places.filter((p) => p.group === g.id).sort(byName);
            if (items.length === 0) return null;
            return (
              <optgroup key={g.id} label={g.label}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {pick(lang, p.name)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
        {t("Mission region")}
        <select className="field !py-1.5 !text-xs" value={regions.some((r) => r.id === regionId) ? regionId : (regions[0]?.id ?? "")} onChange={(e) => select({ regionId: e.target.value })}>
          {programs.map((p) => (
            <optgroup key={p} label={p}>
              {regions
                .filter((r) => r.program === p)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {pick(lang, r.name)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
        {t("What you want to test")}
        <select className="field !py-1.5 !text-xs" value={objectiveId} onChange={(e) => select({ objectiveId: e.target.value })}>
          {Object.entries(ds.objectives).map(([id, o]) => (
            <option key={id} value={id}>
              {pick(lang, o.label)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs leading-relaxed text-slate-400 sm:col-span-2 lg:col-span-4">{pick(lang, ds.objectives[objectiveId]?.description)}</p>
      {objectiveId === CUSTOM_OBJECTIVE && (
        <fieldset className="grid gap-x-6 gap-y-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
          <legend className="sr-only">{t("Weight of each category")}</legend>
          {(Object.keys(ds.categories) as (keyof typeof weights)[])
            .sort((a, b) => ds.categories[a].order - ds.categories[b].order)
            .map((c) => (
              <label key={c} className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="flex justify-between">
                  {pick(lang, ds.categories[c].label)}
                  <span className="tabular-nums text-white">{total > 0 ? Math.round((weights[c] / total) * 100) : 25}%</span>
                </span>
                <input type="range" min={0} max={100} step={5} value={weights[c]} onChange={(e) => setWeight(c, Number(e.target.value))} className="accent-pleiad-300" />
              </label>
            ))}
        </fieldset>
      )}
    </div>
  );
}
