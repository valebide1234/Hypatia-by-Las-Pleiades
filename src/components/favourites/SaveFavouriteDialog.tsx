import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { favouriteForSite, foldersOf, sortFolders } from "@/lib/favourites";
import { useUserData } from "@/store/userData";
import { folderGlyph } from "./folderStyle";

interface Props {
  siteId: string;
  siteName: string;
  onClose: () => void;
}

/** Save (or edit) a favourite: optional folders (several allowed, or a new one inline) and a note. */
export default function SaveFavouriteDialog({ siteId, siteName, onClose }: Props) {
  const fav = useUserData((s) => s.fav);
  const { saveFavourite, removeFavourite, createFolder } = useUserData.getState();
  const existing = favouriteForSite(fav, siteId);
  const folders = useMemo(() => sortFolders(fav.folders), [fav.folders]);
  const [selected, setSelected] = useState<string[]>(() => (existing ? foldersOf(fav, existing.id).map((f) => f.id) : []));
  const [note, setNote] = useState(existing?.note ?? "");
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => noteRef.current?.focus({ preventScroll: true }), []);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    const folder = await createFolder(name);
    setSelected((cur) => [...cur, folder.id]);
    setNewFolder("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await saveFavourite(siteId, note, selected);
    setBusy(false);
    onClose();
  };

  return (
    <form
      role="dialog"
      aria-labelledby={titleId}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="glass absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] !bg-space-900/95 p-4 text-xs text-slate-300"
    >
      <h3 id={titleId} className="text-sm font-semibold text-white">
        {existing ? "Edit favourite" : "Save to favourites"}
      </h3>
      <p className="mt-0.5 truncate text-slate-400">{siteName}</p>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Folders (optional)</legend>
        {folders.length === 0 && <p className="text-slate-500">No folders yet. It will be saved as Unfiled.</p>}
        <ul className="max-h-36 space-y-1 overflow-y-auto">
          {folders.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5">
                <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} className="accent-pleiad-300" />
                <span aria-hidden="true" style={{ color: f.color ?? undefined }}>
                  {folderGlyph(f.icon)}
                </span>
                <span className="text-slate-200">{f.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <label className="sr-only" htmlFor={`${titleId}-nf`}>
            New folder name
          </label>
          <input
            id={`${titleId}-nf`}
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addFolder();
              }
            }}
            maxLength={80}
            placeholder="New folder…"
            className="field !py-1.5 !text-xs"
          />
          <button type="button" onClick={() => void addFolder()} disabled={!newFolder.trim()} className="shrink-0 rounded-lg border border-white/20 px-2.5 hover:border-white/50 disabled:opacity-40">
            Create
          </button>
        </div>
      </fieldset>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">Personal note (optional)</span>
        <textarea ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className="field resize-y !text-xs" />
      </label>

      <div className="mt-3 flex items-center justify-between gap-2">
        {existing ? (
          <button
            type="button"
            onClick={() => {
              void removeFavourite(existing.id);
              onClose();
            }}
            className="rounded-full px-2.5 py-1.5 text-rose-300 hover:bg-rose-300/10"
          >
            Remove
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 hover:bg-white/10">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-full bg-pleiad-300 px-3 py-1.5 font-medium text-space-950 hover:bg-white disabled:opacity-50">
            {existing ? "Save changes" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
