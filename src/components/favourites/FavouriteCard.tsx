import { useState } from "react";
import Popover from "@/components/common/Popover";
import { PinIcon } from "@/components/globe/SitesOverlay";
import { foldersOf, sortFolders, type FavEntry, type FavState, type FolderView } from "@/lib/favourites";
import { useUserData } from "@/store/userData";
import { ORIGIN_LABEL, TARGET_LABEL } from "@/types/site";
import { DND_FAVOURITE } from "./dnd";
import { folderGlyph } from "./folderStyle";

interface Props {
  entry: FavEntry;
  fav: FavState;
  view: FolderView;
  onOpen: (siteId: string) => void;
}

export default function FavouriteCard({ entry, fav, view, onOpen }: Props) {
  const { favourite, site } = entry;
  const { moveFavourite, copyFavourite, removeFavourite, setNote } = useUserData.getState();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(favourite.note);
  const inFolders = foldersOf(fav, favourite.id);
  const allFolders = sortFolders(fav.folders);
  const fromFolder = view !== "all" && view !== "unfiled" ? view : null;
  const name = site?.name ?? `Unknown site (${favourite.siteId})`;

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_FAVOURITE, favourite.id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/20"
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="cursor-grab select-none pt-0.5 text-slate-600" title="Drag onto a folder">
          ⠿
        </span>
        {site && <PinIcon origin={site.origin} scale={0.55} />}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => site && onOpen(site.id)} disabled={!site} className="text-left text-sm font-medium text-white hover:underline disabled:no-underline">
            {name}
          </button>
          <p className="text-[11px] text-slate-400">
            {site ? (
              <>
                {site.country} · {ORIGIN_LABEL[site.origin]} · {site.targets.map((t) => TARGET_LABEL[t]).join(" & ")}
              </>
            ) : (
              "This site is no longer in the catalogue."
            )}
          </p>
          {inFolders.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Folders">
              {inFolders.map((f) => (
                <li key={f.id} className="inline-flex items-center gap-1 rounded-full bg-space-800 px-2 py-0.5 text-[10px] text-slate-300">
                  <span aria-hidden="true" style={{ color: f.color ?? undefined }}>
                    {folderGlyph(f.icon)}
                  </span>
                  {f.name}
                </li>
              ))}
            </ul>
          )}
          {editing ? (
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void setNote(favourite.id, draft);
                setEditing(false);
              }}
            >
              <label className="sr-only" htmlFor={`note-${favourite.id}`}>
                Note for {name}
              </label>
              <textarea id={`note-${favourite.id}`} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} className="field resize-y !text-xs" />
              <div className="mt-1 flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => (setDraft(favourite.note), setEditing(false))} className="rounded-full px-2.5 py-1 hover:bg-white/10">
                  Cancel
                </button>
                <button type="submit" className="rounded-full bg-pleiad-300 px-2.5 py-1 font-medium text-space-950">
                  Save note
                </button>
              </div>
            </form>
          ) : (
            favourite.note && <p className="mt-1.5 whitespace-pre-line text-xs italic text-slate-300">“{favourite.note}”</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1 text-xs">
        <span className="mr-auto text-[10px] text-slate-500">Saved {new Date(favourite.createdAt).toLocaleDateString()}</span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full px-2 py-1 text-slate-300 hover:bg-white/10">
          {favourite.note ? "Edit note" : "Add note"}
        </button>
        <Popover
          label={`Move or copy ${name}`}
          align="right"
          className="w-60 text-xs"
          trigger={(p) => (
            <button {...p} type="button" className="rounded-full px-2 py-1 text-slate-300 hover:bg-white/10">
              Move to… ▾
            </button>
          )}
        >
          <p className="px-2 text-[11px] uppercase tracking-widest text-slate-500">{fromFolder ? "Move to" : "Add to folder"}</p>
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {allFolders.map((f) => {
              const already = inFolders.some((x) => x.id === f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => void moveFavourite(favourite.id, fromFolder, f.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10 disabled:opacity-40"
                  >
                    <span aria-hidden="true" style={{ color: f.color ?? undefined }}>
                      {folderGlyph(f.icon)}
                    </span>
                    {f.name}
                    {already && <span className="ml-auto text-[10px]">(already)</span>}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                disabled={inFolders.length === 0}
                onClick={() => void moveFavourite(favourite.id, fromFolder, null)}
                className="w-full rounded px-2 py-1 text-left hover:bg-white/10 disabled:opacity-40"
              >
                ○ Unfiled {fromFolder ? "(remove from this folder)" : "(remove from all folders)"}
              </button>
            </li>
          </ul>
          {fromFolder && allFolders.length > 1 && (
            <>
              <p className="mt-2 px-2 text-[11px] uppercase tracking-widest text-slate-500">Copy to</p>
              <ul className="mt-1 max-h-40 overflow-y-auto">
                {allFolders
                  .filter((f) => !inFolders.some((x) => x.id === f.id))
                  .map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => void copyFavourite(favourite.id, f.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10">
                        <span aria-hidden="true" style={{ color: f.color ?? undefined }}>
                          {folderGlyph(f.icon)}
                        </span>
                        {f.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
          {allFolders.length === 0 && <p className="px-2 py-1 text-slate-500">Create a folder first.</p>}
        </Popover>
        <button type="button" onClick={() => void removeFavourite(favourite.id)} className="rounded-full px-2 py-1 text-rose-300 hover:bg-rose-300/10" aria-label={`Remove ${name} from favourites`}>
          Remove
        </button>
      </div>
    </li>
  );
}
