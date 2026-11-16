import { useEffect } from "react";
import { Link } from "react-router-dom";
import ImageCredit from "@/components/common/ImageCredit";
import { TARGET_CARD_IMAGES } from "@/data/targetImages";
import { SITES, sitesForTarget } from "@/data/sites";
import { useTour } from "@/store/tour";
import { TARGETS, type Target } from "@/types/site";
import { tx, useT } from "@/i18n";
import { asset } from "@/lib/asset";

const BLURB: Record<Target, string> = {
  moon: tx("Impact structures, basaltic lava fields and anorthosite used to train crews and test surface operations."),
  mars: tx("Hyperarid soils, ice-rich ground, sulfates and clays used to test rovers, drills and life-detection instruments."),
};
const TITLE: Record<Target, string> = { moon: tx("Moon analogs"), mars: tx("Mars analogs") };

export default function TargetSelectPage() {
  const t = useT();
  // First visit: explain what the app is for.
  useEffect(() => useTour.getState().startIfFirstVisit("targets"), []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-10 sm:py-14">
        <h1 className="font-display text-4xl text-white sm:text-5xl">{t("Choose a target")}</h1>
        <p className="mt-2 max-w-xl text-center text-sm text-slate-400">
          {t("Explore the places on Earth used to study and rehearse missions to another world.")}
        </p>

        <div data-tour="target-cards" className="mt-10 grid w-full gap-6 md:grid-cols-2">
          {TARGETS.map((x) => {
            const img = TARGET_CARD_IMAGES[x];
            const count = sitesForTarget(SITES, x).length;
            return (
              <article key={x} className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-space-900 transition-colors focus-within:border-pleiad-300 hover:border-white/30">
                <Link to={`/explore/${x}`} className="flex flex-1 flex-col focus-visible:ring-0" aria-label={t(TITLE[x])}>
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-black">
                    <img
                      src={asset(img.url)}
                      alt={img.caption}
                      className="h-[92%] w-auto object-contain transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h2 className="font-display text-3xl text-white">{t(TITLE[x])}</h2>
                    <p className="text-sm text-slate-300">{t(BLURB[x])}</p>
                    <p className="mt-auto pt-2 text-xs uppercase tracking-widest text-pleiad-300">
                      {t("{n} sites · Open globe →", { n: count })}
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
