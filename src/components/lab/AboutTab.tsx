import { TeamAbout } from "@/components/common/Credits";
import { useT } from "@/i18n";
import type { LabDataset } from "@/lab/types";
import { Card, Note } from "./ui";

/** Who made Hypatia, what the Lab is, and what it must not be taken for. */
export default function AboutTab({ ds }: { ds: LabDataset }) {
  const t = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t("The team")}>
        <TeamAbout />
      </Card>
      <Card title={t("What Hypatia is for")}>
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>{t("Before anything is sent to the Moon or Mars it has to be tried on Earth, in places that resemble where the mission is going. Hypatia brings together the places already used for that, and looks for new ones.")}</p>
          <p>{t("The globe shows the catalogue and the new candidates. The Lab is where every comparison can be opened up: each value, where it came from, how the score is built, what the pair is good for and what no place on Earth can reproduce.")}</p>
          <p>{t("The data come from NASA and Copernicus services and are refreshed when the engine is run again; the Sources tab shows how recent they are.")}</p>
        </div>
      </Card>
      <Card title={t("What it must not be taken for")} className="lg:col-span-2">
        <ul className="grid list-disc gap-x-8 gap-y-2 pl-5 text-sm leading-relaxed text-slate-300 marker:text-slate-500 md:grid-cols-2">
          <li>{t("A high score is not proof that two environments are the same. It ranks places on the variables that could be compared.")}</li>
          <li>{t("New candidates are proposals from data. Nobody has verified them in the field, and their geology has not been assessed.")}</li>
          <li>{t("Measured, modelled and inferred values are labelled as such everywhere; a missing value is reported, never filled in.")}</li>
          <li>{t("Hypatia is an independent project that uses public data. It is not endorsed by NASA, ESA or any other agency.")}</li>
        </ul>
        <div className="mt-4">
          <Note>
            {t("Engine version {v}, data of {date}.", { v: ds.engineVersion, date: ds.generatedAt.slice(0, 10) })}
          </Note>
        </div>
      </Card>
    </div>
  );
}
