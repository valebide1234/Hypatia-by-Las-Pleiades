-- Phase 3: analog site catalogue + per-user tables (saved searches, favourites, folders).
-- All user tables use row-level security so users only ever see and change their own rows.

-- ── Analog sites (public, read-only for clients; written by the seed script with the service role) ──
create table if not exists public.analog_sites (
  id text primary key,
  name text not null,
  country text not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  origin text not null check (origin in ('nasa_official', 'literature', 'hypatia_candidate')),
  targets text[] not null check (targets <@ array['moon', 'mars']::text[] and cardinality(targets) > 0),
  data jsonb not null,               -- full AnalogSite document (see src/types/site.ts)
  dataset_version text not null,
  updated_at timestamptz not null default now()
);

alter table public.analog_sites enable row level security;
create policy "analog_sites: public read" on public.analog_sites for select using (true);
-- No insert/update/delete policies: only the service role (which bypasses RLS) can write.

-- ── Saved searches ──
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target text not null check (target in ('moon', 'mars')),
  quality_ids text[] not null default '{}',
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;
create policy "saved_searches: own rows" on public.saved_searches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Favourite sites ──
-- site_id is not a foreign key so that Hypatia discovery candidates (which may not be in
-- analog_sites) can also be favourited.
create table if not exists public.favourite_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  site_id text not null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, site_id)
);

alter table public.favourite_sites enable row level security;
create policy "favourite_sites: own rows" on public.favourite_sites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Favourite folders ──
create table if not exists public.favourite_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists favourite_folders_user_idx on public.favourite_folders (user_id, sort_order);

alter table public.favourite_folders enable row level security;
create policy "favourite_folders: own rows" on public.favourite_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Folder membership (many-to-many: a favourite can be in several folders) ──
-- Deleting a folder removes only its membership rows; the favourites themselves remain
-- (they show as "Unfiled" when they belong to no folder).
create table if not exists public.favourite_folder_items (
  folder_id uuid not null references public.favourite_folders (id) on delete cascade,
  favourite_id uuid not null references public.favourite_sites (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, favourite_id)
);
create index if not exists favourite_folder_items_fav_idx on public.favourite_folder_items (favourite_id);

alter table public.favourite_folder_items enable row level security;
-- Both the folder and the favourite must belong to the current user.
create policy "favourite_folder_items: own rows" on public.favourite_folder_items
  for all
  using (
    exists (select 1 from public.favourite_folders f where f.id = folder_id and f.user_id = auth.uid())
    and exists (select 1 from public.favourite_sites s where s.id = favourite_id and s.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.favourite_folders f where f.id = folder_id and f.user_id = auth.uid())
    and exists (select 1 from public.favourite_sites s where s.id = favourite_id and s.user_id = auth.uid())
  );
