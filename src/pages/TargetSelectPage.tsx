import { Link } from "react-router-dom";
import ImageCredit from "@/components/common/ImageCredit";
import { TARGET_CARD_IMAGES } from "@/data/targetImages";
import { SITES, sitesForTarget } from "@/data/sites";
import { TARGETS, TARGET_LABEL, type Target } from "@/types/site";

const BLURB: Record<Target, string> = {
  moon: "Impact structures, basaltic lava fields and anorthosite used to train crews and test surface operations.",
  mars: "Hyperarid soils, ice-rich ground, sulfates and clays used to test rovers, drills and life-detection instruments.",
};

export default function TargetSelectPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-10 sm:py-14">
        <h1 className="font-display text-4xl text-white sm:text-5xl">Choose a target</h1>
        <p className="mt-2 max-w-xl text-center text-sm text-slate-400">
          Explore the places on Earth used to study and rehearse missions to another world.
        </p>

        <div className="mt-10 grid w-full gap-6 md:grid-cols-2">
          {TARGETS.map((t) => {
            const img = TARGET_CARD_IMAGES[t];
            const count = sitesForTarget(SITES, t).length;
            return (
              <article key={t} className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-space-900 transition-colors focus-within:border-pleiad-300 hover:border-white/30">
                <Link to={`/explore/${t}`} className="flex flex-1 flex-col focus-visible:ring-0" aria-label={`${TARGET_LABEL[t]} analogs`}>
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-black">
                    <img
                      src={img.url}
                      alt={img.caption}
                      className="h-[92%] w-auto object-contain transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h2 className="font-display text-3xl text-white">{TARGET_LABEL[t]} analogs</h2>
                    <p className="text-sm text-slate-300">{BLURB[t]}</p>
                    <p className="mt-auto pt-2 text-xs uppercase tracking-widest text-pleiad-300">
                      {count} sites · Open globe →
                    </p>
                  </div>
                </Link>
                <div className="border-t border-white/5 px-5 py-3">
                  <ImageCredit image={img} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
