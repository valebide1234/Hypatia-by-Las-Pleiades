import { useMemo, useState } from "react";
import { pick, useLang, useT } from "@/i18n";
import { coord, pct } from "@/lab/format";
import { bodyName } from "@/lab/report";
import type { EnvironmentModel, LabDataset } from "@/lab/types";
import { useSelection } from "@/lab/useSelection";
import { CHART, Card, Meter, Note } from "./ui";

const W = 680;
const H = 430;
const PAD = 34;

/** Environment map: every land grid cell placed by the model's two main axes. */
function EnvironmentMap({ ds, model, cluster, placePoint, regionPoint, placeName, regionName, near }: {
  ds: LabDataset;
  model: EnvironmentModel;
  cluster: number | null;
  placePoint: { pc1: number; pc2: number } | null;
  regionPoint: { pc1: number; pc2: number } | null;
  placeName: string;
  regionName: string;
  near: Set<string>;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [hover, setHover] = useState<number | null>(null);
  const { x, y, clamp } = useMemo(() => {
    const xs = model.grid.map((g) => g[2]);
    const ys = model.grid.map((g) => g[3]);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 0.4, Math.max(...xs) + 0.4, Math.min(...ys) - 0.4, Math.max(...ys) + 0.4];
    return {
      x: (v: number) => PAD + ((Math.min(Math.max(v, x0), x1) - x0) / (x1 - x0)) * (W - 2 * PAD),
      y: (v: number) => H - PAD - ((Math.min(Math.max(v, y0), y1) - y0) / (y1 - y0)) * (H - 2 * PAD),
      clamp: (p: { pc1: number; pc2: number }) => p.pc1 < x0 || p.pc1 > x1 || p.pc2 < y0 || p.pc2 > y1,
    };
  }, [model]);
  const axis = (i: number) => model.loadings[i]!.map((l) => `${l.loading > 0 ? "+" : "−"} ${pick(lang, ds.parameters[l.feature]?.label) || l.feature}`).join(", ");
  const h = hover === null ? null : model.grid[hover]!;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best: number | null = null;
    let bestD = 14 * 14;
    model.grid.forEach((g, i) => {
      const d = (x(g[2]) - px) ** 2 + (y(g[3]) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("Map of Earth's environments: each dot is a land grid cell, placed by the two main axes of the model.")} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgb(255 255 255 / 0.12)" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="rgb(255 255 255 / 0.12)" />
        {model.grid.map((g, i) => {
          const isNear = near.has(`${g[0]},${g[1]}`);
          const inCluster = cluster !== null && g[4] === cluster;
          if (isNear) return null;
          return <circle key={i} cx={x(g[2])} cy={y(g[3])} r={inCluster ? 3 : 2.2} fill={inCluster ? CHART.place : CHART.neutral} opacity={inCluster ? 0.85 : 0.45} />;
        })}
        {model.grid.map((g, i) => (near.has(`${g[0]},${g[1]}`) ? <circle key={`n${i}`} cx={x(g[2])} cy={y(g[3])} r={4.5} fill={CHART.near} stroke="#070b16" strokeWidth={2} /> : null))}
        {model.clusters.map((c) => (
          <text key={c.id} x={x(c.pc1)} y={y(c.pc2)} textAnchor="middle" fontSize={10.5} fill="#e2e8f0" stroke="#070b16" strokeWidth={3} paintOrder="stroke" className="pointer-events-none">
            {pick(lang, c.name).replace(/\s*\(.*\)$/, "")}
          </text>
        ))}
        {regionPoint && (
          <g transform={`translate(${x(regionPoint.pc1)} ${y(regionPoint.pc2)})`}>
            <rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" fill={CHART.region} stroke="#070b16" strokeWidth={2} />
            <text x={12} y={4} fontSize={11.5} fill="#f8fafc" stroke="#070b16" strokeWidth={3.5} paintOrder="stroke" fontWeight={600}>
              {regionName}
              {clamp(regionPoint) ? ` (${t("beyond the map")})` : ""}
            </text>
          </g>
        )}
        {placePoint && (
          <g transform={`translate(${x(placePoint.pc1)} ${y(placePoint.pc2)})`}>
            <circle r={7} fill={CHART.place} stroke="#f8fafc" strokeWidth={2} />
            <text x={12} y={4} fontSize={11.5} fill="#f8fafc" stroke="#070b16" strokeWidth={3.5} paintOrder="stroke" fontWeight={600}>
              {placeName}
            </text>
          </g>
        )}
        {h && <circle cx={x(h[2])} cy={y(h[3])} r={6} fill="none" stroke="#f8fafc" strokeWidth={1.5} />}
        <text x={W - PAD} y={H - 10} textAnchor="end" fontSize={10} fill="#94a3b8">
          {t("Axis 1 ({p} of the variation)", { p: pct(model.explainedVariance[0]) })} →
        </text>
        <text x={12} y={PAD - 12} fontSize={10} fill="#94a3b8">
          ↑ {t("Axis 2 ({p} of the variation)", { p: pct(model.explainedVariance[1]) })}
        </text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-white/15 bg-space-900/95 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-xl" style={{ left: `${Math.min(72, (x(h[2]) / W) * 100)}%`, top: `${(y(h[3]) / H) * 100}%`, transform: "translate(12px, -110%)" }}>
          <span className="block font-medium text-white">{coord(h[0], h[1])}</span>
          {pick(lang, model.clusters[h[4]]!.name)} · {t("rarer than {r} of land", { r: pct(h[5]) })}
        </div>
      )}
      <figcaption className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-400">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: CHART.place }} />{t("Selected place and its environment type")}</li>
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rotate-45 align-middle" style={{ backgroundColor: CHART.region }} />{t("Selected mission region")}</li>
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: CHART.near }} />{t("Grid cells closest to the region")}</li>
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: CHART.neutral }} />{t("Other land grid cells")}</li>
        </ul>
        <p>{t("Axis 1 grows with:")} {axis(0)}. {t("Axis 2 grows with:")} {axis(1)}.</p>
      </figcaption>
    </figure>
  );
}

/** The environment model: what it is for, the map, the environment types and the nearest cells. */
export default function ModelTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { place, region } = useSelection(ds);
  const model = ds.model;
  const placed = model?.places[place.id] ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  if (!model) return <Card>{t("The environment model is not available in this data file.")}</Card>;
  const regionInfo = model.regions[region.id] ?? null;
  const cluster = picked ?? placed?.cluster ?? null;
  const near = new Set((regionInfo?.nearest ?? []).map((n) => `${n.lat},${n.lon}`));
  const pLabel = (k: string) => pick(lang, ds.parameters[k]?.label) || k;

  return (
    <div className="space-y-4">
      <Card title={t("What the machine learning is for")} tour="lab-model">
        <div className="grid gap-4 text-sm leading-relaxed text-slate-300 md:grid-cols-3">
          <p>
            <strong className="text-white">{t("1. It sorts Earth into environment types.")}</strong>{" "}
            {t("Nobody tells it what a desert or a polar plateau is. It reads {n} NASA POWER variables for {cells} land grid cells and groups the cells that resemble each other (k-means). That gives {k} types.", { n: model.features.length, cells: model.cells, k: model.clusters.length })}
          </p>
          <p>
            <strong className="text-white">{t("2. It draws a map of environments.")}</strong>{" "}
            {t("The variables are squeezed into two axes that keep {p} of the differences between cells (principal components). Places that sit close on the map have similar conditions, wherever they are on the globe.", { p: pct(model.explainedVariance[0]! + model.explainedVariance[1]!) })}
          </p>
          <p>
            <strong className="text-white">{t("3. It says how rare a place is.")}</strong>{" "}
            {t("An isolation forest scores how unusual each cell's conditions are. Rare environments are where analogs are scarce, so a rare place that matches a mission region is worth more than a common one.")}
          </p>
        </div>
        <div className="mt-4">
          <Note>{t("The model is trained only on Earth's climate from NASA data. It learns no geology, and it does not decide what is an analog: it helps to search and to judge how special a place is.")}</Note>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card title={t("Map of Earth's environments")}>
          <EnvironmentMap ds={ds} model={model} cluster={cluster} placePoint={placed} regionPoint={regionInfo} placeName={pick(lang, place.name)} regionName={pick(lang, region.name)} near={near} />
        </Card>

        <div className="space-y-4">
          <Card title={t("The selected place")}>
            {placed ? (
              <>
                <p className="text-sm text-slate-300">
                  {t("{place} belongs to the type “{type}”.", { place: pick(lang, place.name), type: pick(lang, model.clusters[placed.cluster]!.name) })}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-300">
                  <span className="w-28 shrink-0">{t("Rarity")}</span>
                  <Meter value={placed.rarity} />
                  <span className="w-10 shrink-0 text-right tabular-nums text-white">{pct(placed.rarity)}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {t("Its conditions are rarer than those of {r} of Earth's land grid cells.", { r: pct(placed.rarity) })}
                  {placed.imputed > 0 && ` ${t("{n} of its variables were missing and were filled with Earth's median, so its position is approximate.", { n: placed.imputed })}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">{t("Places added in the Lab are not placed on the map: the model was trained before they were added.")}</p>
            )}
          </Card>

          <Card title={t("Where Earth comes closest to the region")}>
            {regionInfo ? (
              <>
                <p className="text-xs leading-relaxed text-slate-400">
                  {t("The grid cells whose conditions are nearest to {region} on the variables that Earth can match.", { region: pick(lang, region.name) })}
                </p>
                <ol className="mt-2 space-y-1 text-xs text-slate-300">
                  {regionInfo.nearest.map((n, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{i + 1}. {coord(n.lat, n.lon)} · {pick(lang, model.clusters[n.cluster]!.name)}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{t("distance")} {n.distance.toFixed(2)}</span>
                    </li>
                  ))}
                </ol>
                {regionInfo.beyond.length > 0 && (
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                    {t("On these variables {body} lies beyond anything on Earth, so the region is counted as the extreme of Earth's range:", { body: t(bodyName(region.target)) })} {regionInfo.beyond.map(pLabel).join(", ")}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </Card>
        </div>
      </div>

      <Card title={t("Environment types found by the model")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-2 font-medium">{t("Type")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Grid cells")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Mean temperature")}</th>
                <th scope="col" className="pb-2 text-right font-medium">{t("Precipitation")}</th>
                <th scope="col" className="w-40 pb-2 pl-4 font-medium">{t("Mean rarity")}</th>
                <th scope="col" className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {model.clusters.map((c) => (
                <tr key={c.id} className={`border-t border-white/5 ${cluster === c.id ? "bg-white/[0.06]" : ""}`}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-100">{pick(lang, c.name)}</th>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">{c.cells}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">{c.tsurfMeanC} °C</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">{c.precipMmYr.toLocaleString("en-US")} mm/yr</td>
                  <td className="py-1.5 pl-4">
                    <span className="flex items-center gap-2">
                      <Meter value={c.rarity} color={CHART.neutral} />
                      <span className="w-9 shrink-0 text-right tabular-nums text-white">{pct(c.rarity)}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <button type="button" onClick={() => setPicked(picked === c.id ? null : c.id)} aria-pressed={cluster === c.id} className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-slate-200 hover:border-white/40">
                      {cluster === c.id ? t("Shown on the map") : t("Show on the map")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {t("How stable is it? Retrained with {seeds} different random starts, the groups agree at {ari} (1 = identical) and the rarity ranking at {rho}. Group separation (silhouette) is {sil}; values near 0 mean the types blend into each other, which is expected for climate.", { seeds: model.stability.seeds, ari: model.stability.kmeans_ari.toFixed(2), rho: model.stability.forest_spearman.toFixed(2), sil: model.silhouette.toFixed(2) })}{" "}
          {t("Variables used:")} {model.features.map(pLabel).join(", ")}.
        </p>
      </Card>
    </div>
  );
}
