import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "@/components/lab/Markdown";
import { tx, useT } from "@/i18n";
import { TOOL_LABEL, useAssistant } from "@/store/assistant";

const EXAMPLES = [
  tx("Which places are most like Jezero crater for rover mobility?"),
  tx("Find new places for the Artemis south-pole region"),
  tx("Compare Laguna Diamante with Gale crater"),
  tx("Add Salar de Atacama and show it on the globe"),
  tx("What does the engine say about this place?"),
  tx("Where does the data come from?"),
];

/**
 * The conversation with Hypatia's assistant: the same on the globe (in the floating panel) and
 * in the Lab. With an API key configured it is Claude, calling tools that run on the engine's
 * data; without one it answers with built-in rules from the same data.
 */
export default function AssistantChat({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const { messages, busy, activity, mode, ask, reset } = useAssistant();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. (An effect must return nothing or a cleanup function.)
  useEffect(() => {
    if (messages.length > 0 || busy) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, activity]);

  const send = (text: string) => {
    setInput("");
    void ask(text, navigate);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wider ${mode === "ai" ? "border-emerald-300/40 text-emerald-100" : mode === "rules" ? "border-slate-300/30 text-slate-300" : "border-white/15 text-slate-300"}`}>
          {mode === "ai" ? t("AI connected") : mode === "rules" ? t("Built-in answers") : t("AI: checking on first question")}
        </span>
        {mode === "rules" && <span>{t("No AI key on this copy: answers are computed with fixed rules from the same data.")}</span>}
        {messages.length > 0 && (
          <button type="button" onClick={reset} className="ml-auto rounded-full px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white">
            {t("New conversation")}
          </button>
        )}
      </p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-sm leading-relaxed text-slate-300">
            <p>{t("Ask about any place, mission region or kind of test. The assistant can also find new places, add one from live NASA data, show it on the globe and open a comparison in the Lab.")}</p>
            <ul className={`mt-3 flex flex-wrap gap-2 ${compact ? "max-h-40 overflow-y-auto" : ""}`}>
              {EXAMPLES.map((x) => (
                <li key={x}>
                  <button type="button" onClick={() => send(t(x))} className="rounded-full border border-white/15 px-3 py-1.5 text-left text-xs text-slate-200 hover:border-white/40">
                    {t(x)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.from === "user" ? "flex justify-end" : ""}>
            {m.from === "user" ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-pleiad-300 px-3.5 py-2 text-sm text-space-950">{m.text}</p>
            ) : (
              <div className="max-w-[94%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-3">
                <Markdown source={m.text} />
                <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
                  {m.by === "ai" ? t("AI answer from the engine's data") : t("Built-in answer from the engine's data")}
                  {m.tools && m.tools.length > 0 && ` · ${[...new Set(m.tools)].map((n) => t(TOOL_LABEL[n] ?? n)).join(", ")}`}
                </p>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-xs text-slate-400">{activity ? `${activity}…` : t("Working…")}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2 border-t border-white/10 pt-3">
        <label className="sr-only" htmlFor={compact ? "assistant-question-dock" : "assistant-question"}>{t("Your question")}</label>
        <input id={compact ? "assistant-question-dock" : "assistant-question"} className="field !py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("Ask a question, or ask it to add or find a place")} autoComplete="off" />
        <button type="submit" disabled={busy || !input.trim()} className="shrink-0 rounded-full bg-pleiad-300 px-5 text-sm font-semibold text-space-950 hover:bg-white disabled:opacity-40">
          {t("Ask")}
        </button>
      </form>
    </div>
  );
}
