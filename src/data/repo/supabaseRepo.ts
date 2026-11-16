import type { SupabaseClient } from "@supabase/supabase-js";
import type { Favourite, Folder, FolderItem } from "@/lib/favourites";
import type { Target } from "@/types/site";
import type { SavedSearch, UserDataRepo } from "./types";

/** Supabase implementation. Row-level security limits every query to the signed-in user's rows. */
export function createSupabaseRepo(sb: SupabaseClient): UserDataRepo {
  const check = <T extends { error: { message: string } | null }>(r: T): T => {
    if (r.error) throw new Error(r.error.message);
    return r;
  };
  return {
    kind: "supabase",
    async load() {
      const [favs, folders, items, searches] = await Promise.all([
        sb.from("favourite_sites").select("id, site_id, note, created_at"),
        sb.from("favourite_folders").select("id, name, color, icon, sort_order, created_at"),
        sb.from("favourite_folder_items").select("folder_id, favourite_id"),
        sb.from("saved_searches").select("id, target, quality_ids, name, created_at").order("created_at", { ascending: false }),
      ]).then((rs) => rs.map(check));
      return {
        fav: {
          favourites: (favs!.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            siteId: r.site_id as string,
            note: (r.note as string | null) ?? "",
            createdAt: r.created_at as string,
          })),
          folders: (folders!.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            name: r.name as string,
            color: (r.color as string | null) ?? null,
            icon: (r.icon as string | null) ?? null,
            sortOrder: r.sort_order as number,
            createdAt: r.created_at as string,
          })),
          items: (items!.data ?? []).map((r: Record<string, unknown>) => ({ folderId: r.folder_id as string, favouriteId: r.favourite_id as string })),
        },
        searches: (searches!.data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          target: r.target as Target,
          qualityIds: (r.quality_ids as string[]) ?? [],
          name: r.name as string,
          createdAt: r.created_at as string,
        })),
      };
    },
    async insertFavourite(f: Favourite) {
      check(await sb.from("favourite_sites").insert({ id: f.id, site_id: f.siteId, note: f.note || null, created_at: f.createdAt }));
    },
    async deleteFavourite(id) {
      check(await sb.from("favourite_sites").delete().eq("id", id));
    },
    async updateNote(id, note) {
      check(await sb.from("favourite_sites").update({ note: note || null }).eq("id", id));
    },
    async insertFolder(f: Folder) {
      check(await sb.from("favourite_folders").insert({ id: f.id, name: f.name, color: f.color, icon: f.icon, sort_order: f.sortOrder, created_at: f.createdAt }));
    },
    async updateFolders(folders: Folder[]) {
      if (!folders.length) return;
      check(
        await sb.from("favourite_folders").upsert(
          folders.map((f) => ({ id: f.id, name: f.name, color: f.color, icon: f.icon, sort_order: f.sortOrder, created_at: f.createdAt })),
          { onConflict: "id" },
        ),
      );
    },
    async deleteFolder(id) {
      check(await sb.from("favourite_folders").delete().eq("id", id));
    },
    async addItems(items: FolderItem[]) {
      if (!items.length) return;
      check(await sb.from("favourite_folder_items").insert(items.map((i) => ({ folder_id: i.folderId, favourite_id: i.favouriteId }))));
    },
    async removeItems(items: FolderItem[]) {
      for (const i of items) {
        check(await sb.from("favourite_folder_items").delete().eq("folder_id", i.folderId).eq("favourite_id", i.favouriteId));
      }
    },
    async insertSearch(s: SavedSearch) {
      check(await sb.from("saved_searches").insert({ id: s.id, target: s.target, quality_ids: s.qualityIds, name: s.name, created_at: s.createdAt }));
    },
    async deleteSearch(id) {
      check(await sb.from("saved_searches").delete().eq("id", id));
    },
  };
}
