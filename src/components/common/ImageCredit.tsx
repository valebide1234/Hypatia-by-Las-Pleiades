import type { ImageRef } from "@/types/site";

/** Mandatory credit line for every image: instrument/mission, date, credit, licence and source. */
export default function ImageCredit({ image, className = "" }: { image: ImageRef; className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-slate-400 ${className}`}>
      {image.instrument && <span>{image.instrument}. </span>}
      {image.date && <span>{image.date}. </span>}
      <span>Credit: {image.credit}. </span>
      <span>{image.license}. </span>
      <span>Via {image.source}: </span>
      <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
        original<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
