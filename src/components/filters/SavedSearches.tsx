import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Popover from "@/components/common/Popover";
import { QUALITY_BY_ID } from "@/data/qualities";
import type { SavedSearch } from "@/data/repo/types";
import { TARGET_LABEL, type Target } from "@/types/site";

interface Props {
  signedIn: boolean;
  target: Target;
  selected: readonly string[];
  searches: SavedSearch[];
  onSave: (name: string) => void;
  onLoad: (s: SavedSearch) => void;
  onDelete: (id: string) => void;
}

const defaultName = (target: Target, ids: readonly string[]) =>
  `${TARGET_LABEL[target]}: ${ids.map((q) => QUALITY_BY_ID.get(q)?.label ?? q).join(" + ")}`.slice(0, 120);

/** Save the current target + qualities, and reload saved searches (signed-in users only). */
export default function SavedSearches({ signedIn, target, selected, searches, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState("");

  if (!signedIn) {
    return (
      <Popover
        label="Sign in to save searches"
        align="right"
        className="w-60 text-xs text-slate-300"
        trigger={(p) => (
          <button {...p} type="button" className="rounded-full px-2.5 py-1 text-xs text-slate-400 hover:text-white">
            Save search
          </button>
        )}
      >
        <p className="font-medium text-white">Sign in to save searches</p>
        <p className="mt-1">Guest searches disappear when you reload.</p>
        <Link to="/auth" className="mt-3 inline-block rounded-full bg-pleiad-300 px-3 py-1 font-medium text-space-950 hover:bg-white">
          Log in
        </Link>
      </Popover>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(name.trim() || defaultName(target, selected));
    setName("");
  };

  return (
    <Popover
      label="Saved searches"
      align="right"
      className="w-[min(22rem,calc(100vw-2rem))] text-xs text-slate-300"
      trigger={(p) => (
        <button {...p} type="button" className="rounded-full px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
          Saved searches{searches.length ? ` (${searches.length})` : ""} ▾
        </button>
      )}
    >
      <form onSubmit={submit} className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Save current search</p>
        {selected.length === 0 ? (
          <p className="text-slate-500">Select at least one quality first.</p>
        ) : (
          <div className="flex gap-1.5">
            <label className="sr-only" htmlFor="search-name">
              Search name
            </label>
            <input id="search-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={defaultName(target, selected)} className="field !py-1.5 !text-xs" />
            <button type="submit" className="shrink-0 rounded-lg bg-pleiad-300 px-2.5 font-medium text-space-950 hover:bg-white">
              Save
            </button>
          </div>
        )}
      </form>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Saved</p>
      {searches.length === 0 ? (
        <p className="mt-1 text-slate-500">No saved searches yet.</p>
      ) : (
        <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto">
          {searches.map((s) => (
            <li key={s.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5">
              <button type="button" onClick={() => onLoad(s)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-slate-100">{s.name}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {TARGET_LABEL[s.target]} · {s.qualityIds.length} qualit{s.qualityIds.length === 1 ? "y" : "ies"} · {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </button>
              <button type="button" onClick={() => onDelete(s.id)} aria-label={`Delete saved search ${s.name}`} className="rounded px-1 text-slate-500 hover:text-rose-300">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
