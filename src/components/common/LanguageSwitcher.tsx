import { LANGS, useLang, useT, type Lang } from "@/i18n";

/** Interface language: English (default), Spanish or Italian. Remembered in this browser. */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <label className={`inline-flex items-center ${className}`} data-tour="language">
      <span className="sr-only">{t("Language")}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="rounded-full border border-white/15 bg-space-900/80 py-1 pl-2.5 pr-1 text-xs text-slate-200 hover:border-white/40"
        aria-label={t("Language")}
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
