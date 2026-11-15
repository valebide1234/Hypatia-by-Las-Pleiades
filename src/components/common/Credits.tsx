import { useT } from "@/i18n";

export const TEAM_NAME = "Las Pléyades";

/** Who made Hypatia. Shown on the first screen and in the Lab's About tab. */
export function TeamLine({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <p className={className}>
      {t("Created by")} <strong className="font-semibold text-slate-200">{TEAM_NAME}</strong>
    </p>
  );
}

export function TeamAbout() {
  const t = useT();
  return (
    <>
      <p className="font-display text-4xl text-white">{TEAM_NAME}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        {t("Hypatia was created by Las Pléyades, a team of girls aged 17 and 18 who have taken part in space and engineering projects such as cometa.sim, ShakthiSAT and NASA Astro Camp.")}
      </p>
    </>
  );
}
