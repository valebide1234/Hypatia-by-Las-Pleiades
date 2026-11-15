import { useState } from "react";
import Popover from "@/components/common/Popover";
import { folderCount, sortFolders, type FavState, type FolderView } from "@/lib/favourites";
import { useUserData } from "@/store/userData";
import { DND_FAVOURITE, DND_FOLDER, hasType } from "./dnd";
import { FOLDER_COLORS, FOLDER_ICONS, folderGlyph } from "./folderStyle";

interface Props {
  fav: FavState;
  view: FolderView;
  onView: (v: FolderView) => void;
  /** Drop a favourite onto a folder (null = Unfiled); `copy` when Alt/Option is held. */
  onDropFavourite: (favouriteId: string, toFolderId: string | null, copy: boolean) => void;
}

export default function FolderSidebar({ fav, view, onView, onDropFavourite }: Props) {
  const { createFolder, editFolder, deleteFolder, shiftFolder, reorderFolders } = useUserData.getState();
  const folders = sortFolders(fav.folders);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const unfiledCount = fav.favourites.filter((f) => !fav.items.some((i) => i.favouriteId === f.id)).length;
  const onlyHere = (folderId: string) =>
    fav.items.filter((i) => i.folderId === folderId && !fav.items.some((j) => j.favouriteId === i.favouriteId && j.folderId !== folderId)).length;

  const dropProps = (key: string, toFolderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (hasType(e, DND_FAVOURITE) || (toFolderId && hasType(e, DND_FOLDER))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = hasType(e, DND_FAVOURITE) && e.altKey ? "copy" : "move";
        setDropTarget(key);
      }
    },
    onDragLeave: () => setDropTarget((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      setDropTarget(null);
      const favId = e.dataTransfer.getData(DND_FAVOURITE);
      if (favId) {
        e.preventDefault();
        onDropFavourite(favId, toFolderId, e.altKey);
        return;
      }
      const folderId = e.dataTransfer.getData(DND_FOLDER);
      if (folderId && toFolderId && folderId !== toFolderId) {
        e.preventDefault();
        const ids = folders.map((f) => f.id).filter((id) => id !== folderId);
        ids.splice(ids.indexOf(toFolderId), 0, folderId);
        void reorderFolders(ids);
      }
    },
  });

  const rowCls = (key: string, active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"} ${dropTarget === key ? "ring-2 ring-pleiad-300" : ""}`;

  return (
    <nav aria-label="Folders" className="flex min-h-0 flex-col gap-1 overflow-y-auto p-3">
      <button type="button" aria-current={view === "all"} className={rowCls("all", view === "all")} onClick={() => onView("all")}>
        <span aria-hidden="true" className="w-4 text-center">★</span>
        <span className="flex-1">All favourites</span>
        <span className="text-xs tabular-nums text-slate-500">{fav.favourites.length}</span>
      </button>
      <button type="button" aria-current={view === "unfiled"} className={rowCls("unfiled", view === "unfiled")} onClick={() => onView("unfiled")} {...dropProps("unfiled", null)}>
        <span aria-hidden="true" className="w-4 text-center">○</span>
        <span className="flex-1">Unfiled</span>
        <span className="text-xs tabular-nums text-slate-500">{unfiledCount}</span>
      </button>

      <h3 className="mb-1 mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Folders</h3>
      <ul className="space-y-0.5">
        {folders.map((f, idx) => (
          <li key={f.id} className="group">
            {renaming === f.id ? (
              <form
                className="flex gap-1 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renameValue.trim()) void editFolder(f.id, { name: renameValue.trim() });
                  setRenaming(null);
                }}
              >
                <label className="sr-only" htmlFor={`rn-${f.id}`}>
                  Rename folder {f.name}
                </label>
                <input
                  id={`rn-${f.id}`}
                  autoFocus
                  value={renameValue}
                  maxLength={80}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setRenaming(null))}
                  className="field !py-1 !text-xs"
                />
                <button type="submit" className="rounded px-2 text-xs text-pleiad-300">
                  Save
                </button>
              </form>
            ) : (
              <div
                className={rowCls(f.id, view === f.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_FOLDER, f.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                {...dropProps(f.id, f.id)}
              >
                <button type="button" aria-current={view === f.id} onClick={() => onView(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span aria-hidden="true" className="w-4 text-center" style={{ color: f.color ?? undefined }}>
                    {folderGlyph(f.icon)}
                  </span>
                  <span className="truncate">{f.name}</span>
                </button>
                <span className="text-xs tabular-nums text-slate-500 group-focus-within:hidden group-hover:hidden">{folderCount(fav, f.id)}</span>
                <span className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
                  <button type="button" aria-label={`Move ${f.name} up`} disabled={idx === 0} onClick={() => void shiftFolder(f.id, -1)} className="rounded px-1 text-xs text-slate-400 hover:text-white disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label={`Move ${f.name} down`} disabled={idx === folders.length - 1} onClick={() => void shiftFolder(f.id, 1)} className="rounded px-1 text-xs text-slate-400 hover:text-white disabled:opacity-30">
                    ↓
                  </button>
                  <Popover
                    label={`Edit folder ${f.name}`}
                    align="right"
                    className="w-56 text-xs"
                    trigger={(p) => (
                      <button {...p} type="button" aria-label={`Edit folder ${f.name}`} className="rounded px-1 text-xs text-slate-400 hover:text-white">
                        ⋯
                      </button>
                    )}
                  >
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-left hover:bg-white/10"
                      onClick={() => {
                        setRenameValue(f.name);
                        setRenaming(f.id);
                      }}
                    >
                      Rename
                    </button>
                    <p className="mt-2 px-2 text-[11px] uppercase tracking-widest text-slate-500">Colour</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 px-2" role="radiogroup" aria-label="Folder colour">
                      {FOLDER_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={f.color === c}
                          aria-label={`Colour ${c}`}
                          onClick={() => void editFolder(f.id, { color: c })}
                          className={`h-5 w-5 rounded-full ${f.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-space-900" : ""}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 px-2 text-[11px] uppercase tracking-widest text-slate-500">Icon</p>
                    <div className="mt-1 flex flex-wrap gap-1 px-2" role="radiogroup" aria-label="Folder icon">
                      {Object.entries(FOLDER_ICONS).map(([k, g]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={(f.icon ?? "dot") === k}
                          aria-label={`Icon ${k}`}
                          onClick={() => void editFolder(f.id, { icon: k })}
                          className={`h-6 w-6 rounded ${(f.icon ?? "dot") === k ? "bg-white/20" : "hover:bg-white/10"}`}
                          style={{ color: f.color ?? undefined }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="mt-3 w-full rounded px-2 py-1 text-left text-rose-300 hover:bg-rose-300/10" onClick={() => setConfirmDelete(f.id)}>
                      Delete folder…
                    </button>
                  </Popover>
                </span>
              </div>
            )}
            {confirmDelete === f.id && (
              <div role="alertdialog" aria-label={`Delete folder ${f.name}?`} className="m-1 rounded-lg border border-rose-300/40 bg-rose-300/10 p-2.5 text-xs text-rose-50">
                <p>
                  Delete “{f.name}”? Its {folderCount(fav, f.id)} favourite{folderCount(fav, f.id) === 1 ? "" : "s"} will stay saved
                  {onlyHere(f.id) > 0 ? `; ${onlyHere(f.id)} will become Unfiled` : ""}.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" autoFocus onClick={() => setConfirmDelete(null)} className="rounded-full px-2.5 py-1 hover:bg-white/10">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteFolder(f.id);
                      setConfirmDelete(null);
                      if (view === f.id) onView("all");
                    }}
                    className="rounded-full bg-rose-300 px-2.5 py-1 font-medium text-space-950"
                  >
                    Delete folder
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="mt-2 flex gap-1 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          void createFolder(newName.trim(), FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
          setNewName("");
        }}
      >
        <label className="sr-only" htmlFor="new-folder">
          New folder name
        </label>
        <input id="new-folder" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} placeholder="New folder…" className="field !py-1.5 !text-xs" />
        <button type="submit" disabled={!newName.trim()} className="shrink-0 rounded-lg border border-white/20 px-2 text-xs hover:border-white/50 disabled:opacity-40">
          Add
        </button>
      </form>
      <p className="mt-3 px-2 text-[11px] leading-snug text-slate-500">
        Drag a site onto a folder to move it there (hold Alt/Option to copy), or use “Move to…”. Drag folders to reorder.
      </p>
    </nav>
  );
}
