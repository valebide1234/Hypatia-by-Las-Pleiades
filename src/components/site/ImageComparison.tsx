import { useId, useState } from "react";
import ImageCredit from "@/components/common/ImageCredit";
import type { ImageRef } from "@/types/site";

type Mode = "slider" | "side";

interface Props {
  earth: ImageRef[];
  target: ImageRef[];
  targetLabel: string;
}

function Pending({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-space-800 p-4 text-center">
      <span className="text-xs font-medium text-slate-300">Real image pending</span>
      <span className="text-[11px] text-slate-500">No verified {label} image for this pairing yet.</span>
    </div>
  );
}

function Picker({ images, index, onPick, label }: { images: ImageRef[]; index: number; onPick: (i: number) => void; label: string }) {
  if (images.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={`${label} image`} className="flex gap-1.5">
      {images.map((img, i) => (
        <button
          key={img.url}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={`${label} image ${i + 1}: ${img.caption}`}
          onClick={() => onPick(i)}
          className={`h-9 w-12 overflow-hidden rounded border-2 ${i === index ? "border-pleiad-300" : "border-transparent opacity-60 hover:opacity-100"}`}
        >
          <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/**
 * Earth site vs. Moon/Mars feature. Slider mode overlays the two images with a draggable
 * divider (a native range input, so it works with keyboard and touch); side-by-side mode
 * shows them next to each other. Every image keeps its full credit line.
 * Give it a `key` per site/target so its state resets when the site changes.
 */
export default function ImageComparison({ earth, target, targetLabel }: Props) {
  const [mode, setMode] = useState<Mode>("slider");
  const [pos, setPos] = useState(50);
  const [ei, setEi] = useState(0);
  const [ti, setTi] = useState(0);
  const sliderId = useId();

  const e = earth[ei] ?? earth[0];
  const t = target[ti] ?? target[0];
  const canSlide = Boolean(e && t);
  const effectiveMode: Mode = canSlide ? mode : "side";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Comparison view" className="flex rounded-full bg-space-800 p-0.5 text-[11px]">
          {(["slider", "side"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={effectiveMode === m}
              disabled={m === "slider" && !canSlide}
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${effectiveMode === m ? "bg-pleiad-300 font-medium text-space-950" : "text-slate-300 hover:text-white"}`}
            >
              {m === "slider" ? "Slider" : "Side by side"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Picker images={earth} index={ei} onPick={setEi} label="Earth" />
          <Picker images={target} index={ti} onPick={setTi} label={targetLabel} />
        </div>
      </div>

      {effectiveMode === "slider" && e && t ? (
        <div className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <img src={t.url} alt={`${targetLabel}: ${t.caption}`} className="absolute inset-0 h-full w-full object-cover" />
          <img
            src={e.url}
            alt={`Earth: ${e.caption}`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.8)]" style={{ left: `calc(${pos}% - 1px)` }}>
            <span className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-space-950/70 text-xs text-white group-focus-within:ring-2 group-focus-within:ring-pleiad-300">
              ⇆
            </span>
          </div>
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-space-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white">Earth</span>
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-space-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white">{targetLabel}</span>
          <label htmlFor={sliderId} className="sr-only">
            Comparison divider position: left shows Earth, right shows {targetLabel}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(ev) => setPos(Number(ev.target.value))}
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[
            { img: e, label: "Earth" },
            { img: t, label: targetLabel },
          ].map(({ img, label }) => (
            <figure key={label} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
              {img ? (
                <img src={img.url} alt={`${label}: ${img.caption}`} className="h-full w-full object-cover" />
              ) : (
                <Pending label={label} />
              )}
              <figcaption className="pointer-events-none absolute left-2 top-2 rounded bg-space-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {[
          { img: e, label: "Earth" },
          { img: t, label: targetLabel },
        ].map(({ img, label }) =>
          img ? (
            <div key={label}>
              <p className="text-xs text-slate-300">
                <span className="font-semibold text-white">{label}: </span>
                {img.caption}{" "}
                <a href={img.url} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
                  Full size<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
              <ImageCredit image={img} />
            </div>
          ) : (
            <p key={label} className="text-xs text-slate-500">
              <span className="font-semibold text-slate-300">{label}: </span>real image pending.
            </p>
          ),
        )}
        <p className="text-[11px] text-slate-500">Images are cropped to fit; scales differ between the two sides.</p>
      </div>
    </div>
  );
}
