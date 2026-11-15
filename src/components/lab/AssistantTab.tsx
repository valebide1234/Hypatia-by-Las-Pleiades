import AssistantChat from "@/components/assistant/AssistantChat";
import { useT } from "@/i18n";
import { useLab } from "@/lab/store";
import { useAssistant } from "@/store/assistant";
import type { LabDataset } from "@/lab/types";
import { Card } from "./ui";

/** The assistant inside the Lab (the same conversation as the floating panel), with what it can do. */
export default function AssistantTab(_props: { ds: LabDataset }) {
  const t = useT();
  const { userPlaces, removeUserPlace } = useLab();
  const mode = useAssistant((s) => s.mode);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t("Ask the assistant")} tour="lab-assistant" className="flex h-[34rem] flex-col">
        <AssistantChat />
      </Card>

      <div className="space-y-4">
        <Card title={t("How it answers")}>
          <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-slate-300 marker:text-slate-500">
            <li>{t("It works from the engine's data: it ranks, compares and searches with the same scoring as the Compare view, and it says when it has no data.")}</li>
            <li>{t("It can act in the app: find new places, add a place from live NASA data, show a place on the globe and open a comparison in the Lab.")}</li>
            <li>{t("Adding a place sends the name you type to OpenStreetMap, to find it, and its coordinates to NASA POWER, for its climate.")}</li>
            <li>
              {mode === "rules"
                ? t("This copy has no AI key, so answers use fixed rules. With a key, Claude reads your question, chooses which of those tools to use and writes the answer; your questions are then sent to Anthropic.")
                : t("With an AI key, Claude reads your question, chooses which of those tools to use and writes the answer; your questions are then sent to Anthropic. Without one, answers use fixed rules.")}
            </li>
          </ul>
        </Card>
        <Card title={t("Your places")}>
          {userPlaces.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-400">{t("Places you add appear here and in the list of places of every tab. They are kept in this browser.")}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {userPlaces.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => useLab.getState().select({ placeId: p.id })} className="min-w-0 flex-1 truncate text-left text-slate-100 hover:text-white hover:underline">
                    {p.name.en}
                  </button>
                  <button type="button" onClick={() => removeUserPlace(p.id)} aria-label={t("Remove {name}", { name: p.name.en })} className="rounded-full px-2 text-slate-400 hover:bg-white/10 hover:text-white">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
