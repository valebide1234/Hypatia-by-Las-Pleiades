# Build "Hypatia": NASA Terrestrial Analog Finder

You are building **Hypatia**, a scientific web app for exploring places on Earth that NASA (and other space agencies) use as **terrestrial analogs** for the **Moon** and **Mars**. Users can filter the sites by scientific quality, rank the best matches, compare each site with real imagery of the Moon or Mars, and (if signed in) save favourite sites into folders. A future module will add newly discovered analog candidates, so the architecture has to leave room for it from day one.

Work in phases. Finish each phase and confirm it runs before you start the next one. Ask me before you make any decision that would be costly to undo, like changing the stack or reshaping the data schema.

---

## 0. Tech stack (use this unless you have a strong reason not to; if you do, explain why first)

- **Frontend:** React + TypeScript + Vite
- **3D globe:** **CesiumJS** (via `resium` or directly). It's the closest open option to Google Earth: a 3D rotatable globe with satellite imagery, terrain, and custom billboards/pins. Read the Cesium ion token from an env variable (`VITE_CESIUM_ION_TOKEN`) and never hard-code it.
- **Auth + database:** **Supabase** (email/password plus a Google OAuth option). Read the keys from `.env` and include an `.env.example`.
- **Styling:** Tailwind CSS. Use a dark, space-themed UI.
- **State:** Zustand or React context. Keep it simple.
- **Testing:** Vitest for the ranking, filter and favourites-filter logic (this logic is the scientific core and needs tests).

---

## 1. Landing screen

- Full-screen background **inspired by the Pleiades (M45)**: a deep-space backdrop, the seven bright blue-white "sisters" at roughly their real relative positions, a soft blue reflection-nebula haze around them, and faint twinkling background stars. Render it procedurally (canvas/WebGL/SVG) so no image licensing is involved. Add subtle parallax or slow drift and respect `prefers-reduced-motion`.
- Centered title: **Hypatia**
- Subtitle: **NASA terrestrial analog finder**
- Two actions:
  1. **Log in / Sign up**. If the user already has a valid session, skip this and go straight to the target selection screen.
  2. **Continue without an account**, with small helper text: *"Your searches and favourites won't be saved."*
- Guest mode keeps state in memory only (it disappears on reload). Show a small persistent "Guest mode, searches not saved" badge with a "Create account" link.

## 2. Target selection

After landing, the user picks a target:

- **Moon analogs**
- **Mars analogs**

Use two large cards with a real image of each body (see the image rules in §7). Keep a toggle in the top bar so users can switch targets later without going back.

## 3. Globe view

- A 3D Earth globe (CesiumJS) with satellite imagery that you can rotate, zoom, and tilt, like Google Earth.
- It shows pins for every analog site relevant to the selected target (Moon or Mars).
- **Pin types (three visually distinct styles):**
  1. **Official NASA analog sites**: use the custom badge image I'm providing (`nasa-approved-pin.jpg`, a circular "NASA APPROVED" badge). Put it in `public/assets/`, convert it to a PNG with the white corners outside the circle made transparent, and generate a few sizes (e.g. 32/48/64 px). Render it as a circular billboard that scales with zoom and stays legible.
  2. **Other analog sites** (from other agencies or the scientific literature but not used by NASA): a standard pin in a neutral color.
  3. **Hypatia-discovered candidates** (future module, see §9): a pin in a **clearly different color** (e.g., amber/gold) with a distinct shape or outline, so it's never confused with an officially recognized site.
- Add a legend that explains the three pin types.
- Clicking a pin flies the camera to the site and opens the side panel (§4).
- Cluster pins at low zoom levels.

## 4. Site side panel

It slides in from the right when a pin is clicked, can be closed, and is scrollable. Contents:

- Site name, country, coordinates, and the agency or program that uses it (e.g., NASA Desert RATS, the Haughton-Mars Project, NEEMO, PISCES). Use a badge for "Official NASA analog" vs. "Literature analog" vs. "Hypatia candidate".
- **Side-by-side image comparison:** a real photo of the Earth site next to a real photo of the equivalent Moon/Mars feature (e.g., a basaltic lava field ↔ a Mars volcanic plain, an impact crater ↔ a lunar crater). Include a slider or toggle comparison. **Every image must show a caption with its source, instrument/mission, date, and credit/license** (see §7).
- **Why it's an analog:** the qualities it shares with the target, each with a short scientific explanation and a strength rating (strong / moderate / partial).
- **Limitations:** where the analog breaks down (e.g., Earth's atmosphere and magnetic field, liquid water, biological contamination, different gravity, different radiation environment, vegetation). Show these prominently; they matter as much as the similarities.
- **Research use:** what missions, instrument tests, or studies have been done there.
- **References:** clickable links to the primary sources (NASA pages, peer-reviewed papers).
- If filters are active, show the site's **rank** and which selected qualities it matched.
- For logged-in users, a **☆ Add to favourites** button (with a folder picker, see §6). For guests, the button opens a "Sign in to save favourites" prompt.

## 5. Filters and top-10 ranking

### Filter bar (top of the screen)
A bar of selectable **qualities** (chips or a multi-select dropdown, grouped by category). Define the list in a data file so it's easy to extend. A starting set, which you should refine with scientific justification:

- **Geology:** basaltic volcanism, lava tubes, impact craters/shocked rocks, regolith-like fine soils, layered sediments, evaporites/sulfates, clay minerals, hydrothermal deposits, glacial/periglacial landforms, anorthositic rock
- **Environment:** hyperarid, extreme cold, permafrost/ground ice, high UV exposure, high altitude / low pressure, oxidizing soils (perchlorate-like chemistry), low biomass
- **Operational:** isolation/remoteness (for crew and habitat studies), rover/EVA traversal testing, instrument and sample-collection testing, underwater/neutral-buoyancy operations
- Make some qualities target-specific (e.g., "clay minerals" is mostly Mars; "anorthositic rock" is mostly Moon). Only show the qualities relevant to the selected target.

### Matching rules (these are critical; write unit tests for them)
1. A site **matches** only if **every selected quality is among its similarities** and **none of the selected qualities appears among its limitations**. If a quality is listed as a limitation for a site, that site must never satisfy that filter.
2. Score each matching site. Suggested approach: sum the strength weights of the selected qualities (strong = 3, moderate = 2, partial = 1), plus a small bonus for overall analog fidelity. Break ties by number of peer-reviewed references. Document the formula in the UI (an "i" tooltip, "How is this ranked?").
3. **Top 10 ranking panel:** an ordered list of the 10 best matches with name, score, and a key match summary. Clicking an entry flies to the site and opens its side panel.
4. **Globe behavior with filters active:**
   - Show **only matching sites**; hide all non-matching pins.
   - Show **all** matches, including those outside the top 10.
   - Every visible pin shows a **small rank number badge** (1, 2, 3 … n) for its position in the full ranking. Visually emphasize the top 10 (e.g., larger pin or glow).
   - Hypatia-discovered candidates (§9) take part in the ranking on equal terms and can appear in the top 10, but they keep their distinct color.
5. A **Clear filters** button restores the full view.
6. Logged-in users can **save a search** (target + selected qualities + timestamp) and reload it later. Guests can't.

## 6. Favourites panel (logged-in users only)

A separate **Favourites** panel, opened from a ☆ icon in the top bar (a drawer or its own view; your call, but it must not replace the globe permanently).

### Saving
- From the side panel or ranking list, a user can add any site (including Hypatia candidates) to favourites.
- When saving, they can optionally pick one or more **folders** (or create a new folder inline) and add a short **personal note**.
- A saved site shows a filled star on its pin and in the side panel.

### Folders
- Users can **create, rename, delete, and reorder folders**, and optionally pick a color/icon for each.
- A site can live in **more than one folder**; sites in no folder appear under **"Unfiled"**. An **"All favourites"** view shows everything.
- Move/copy sites between folders with drag-and-drop **and** with a keyboard-accessible "Move to…" menu.
- Deleting a folder asks for confirmation and does **not** delete the favourites inside it (they go back to Unfiled unless they're in another folder).

### Filtering and organizing inside the panel
- Text search (name, country, note).
- Filters: target (Moon / Mars / both), pin type (NASA official / literature / Hypatia candidate), qualities (reuse the same quality-filter component from §5), country/region, folder.
- Sort by: date saved, name, ranking score for the current filters, or distance from the current globe view.
- "Show on globe" button: displays only the favourites in the current view/folder on the globe.
- Removing a favourite offers a short "Undo".

### Guests
- The Favourites icon is visible but opens a "Sign in to save and organize favourites" prompt.

## 7. Imagery rules (strict)

- **Use only real photographs or real remote-sensing data. No AI-generated or AI-upscaled images, and no artist's impressions.**
- Approved sources include (verify licensing for each image):
  - **Mars:** NASA/JPL/MSSS/University of Arizona: HiRISE, CTX, MOLA, Mars rover cameras (Curiosity, Perseverance, Opportunity, Spirit), ESA Mars Express HRSC (check its license), NASA Planetary Data System, NASA Photojournal
  - **Moon:** LROC (Lunar Reconnaissance Orbiter Camera), Apollo mission photography (Project Apollo Archive / NASA), Chang'e data where licensing allows
  - **Earth:** NASA Earth Observatory, Landsat (USGS), Copernicus Sentinel-2 (ESA), NASA *Gateway to Astronaut Photography of Earth* (ISS photos), and field photos that carry an explicit open license (Wikimedia Commons CC-BY/CC0, with attribution)
- Store every image's metadata: `source`, `mission/instrument`, `date`, `credit`, `license`, `sourceUrl`. Show the credit in the UI.
- If you can't find a verified real image for a pairing, show a "Real image pending" placeholder rather than inventing one, and log it in a `MISSING_IMAGES.md` file.
- Download images into `public/images/` (or host them in Supabase storage) rather than hot-linking, and record the original URL.

## 8. Data

### Schema (TypeScript types + Supabase tables)
```ts
type Target = "moon" | "mars";
type SiteOrigin = "nasa_official" | "literature" | "hypatia_candidate";
type Strength = "strong" | "moderate" | "partial";

interface AnalogSite {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  origin: SiteOrigin;
  programs: string[];            // e.g. ["Desert RATS"]
  targets: Target[];
  summary: string;
  similarities: { qualityId: string; target: Target; strength: Strength; explanation: string }[];
  limitations: { qualityId?: string; target: Target; explanation: string }[];
  researchUse: string[];
  images: { earth: ImageRef[]; target: ImageRef[] };  // paired comparisons
  references: { title: string; url: string; type: "nasa" | "peer_reviewed" | "other" }[];
  discovery?: DiscoveryMeta;     // only for hypatia_candidate (see §9)
}

interface ImageRef { url: string; caption: string; source: string; instrument?: string; date?: string; credit: string; license: string; sourceUrl: string; }
```

Supabase tables, all with row-level security so users can only see and change their own rows:
- `profiles`
- `saved_searches` (user_id, target, quality_ids, name, created_at)
- `favourite_sites` (id, user_id, site_id, note, created_at; unique on user_id + site_id)
- `favourite_folders` (id, user_id, name, color, icon, sort_order, created_at)
- `favourite_folder_items` (folder_id, favourite_id; many-to-many so a site can be in several folders)

### Seed dataset
Research and build a seed dataset of **at least 25 sites**, with real citations for each. Before you mark any site `nasa_official`, **verify** that it's actually used in NASA analog work, and cite the NASA source. Candidates to research (not exhaustive, and not all of them are NASA sites):

Haughton Crater / Devon Island (Canada), Black Point Lava Flow & San Francisco Volcanic Field (Arizona, Desert RATS), Meteor Crater (Arizona), Mauna Kea & Kīlauea (Hawaiʻi, PISCES), Craters of the Moon (Idaho), Atacama Desert (Chile), McMurdo Dry Valleys (Antarctica), Svalbard (AMASE, Norway), Río Tinto (Spain), Iceland lava fields and glaciers, NEEMO / Aquarius Reef Base (Florida), Mars Desert Research Station (Utah), HI-SEAS (Hawaiʻi), Pavilion Lake (Canada), Lonar Crater (India), Danakil Depression (Ethiopia), Ries Crater (Germany), Sudbury (Canada), Mistastin Crater (Canada), Lanzarote (Spain), Kamchatka hydrothermal fields, Lake Vostok region, Pilbara stromatolites (Australia).

Put the seed data in versioned JSON (`/data/sites.json`) plus a script that loads it into Supabase.

## 9. Reserved extension: Discovery module (do NOT build the analysis; build the slot)

Later I'll give you software that compares datasets and searches for **new analog sites that no space agency has categorized yet**. The user will pick a few filters for what they want to study. Prepare the following:

- A **plugin interface**, e.g. `src/discovery/DiscoveryProvider.ts`:
  ```ts
  interface DiscoveryQuery { target: Target; qualityIds: string[]; region?: GeoJSON.Polygon; }
  interface DiscoveryProvider {
    id: string;
    name: string;
    run(query: DiscoveryQuery): Promise<AnalogSite[]>; // returns sites with origin = "hypatia_candidate"
  }
  ```
- `DiscoveryMeta` on candidate sites: `providerId`, `runAt`, `confidence` (0–1), `datasetsUsed`, `method` (free text), `status` ("unverified" | "under_review" | "confirmed_by_literature").
- A **"Discover new analogs" panel/tab** in the UI with a placeholder ("Discovery engine coming soon") that already reuses the same quality filter component.
- A mock provider that returns 2–3 fake candidates **clearly labeled as test data** so we can confirm the pipeline end to end: amber pins appear, they enter the ranking, the side panel shows a "Hypatia candidate, unverified" warning and the confidence score, and they can be saved to favourites. Make the mock removable with a single flag.
- Candidates are scored with **the same ranking function** as known sites, so they can appear in the top 10 if they really are better matches.
- Document the integration point in `docs/DISCOVERY_INTEGRATION.md`.

## 10. Quality bar

- Responsive (desktop first, usable on tablets), keyboard-navigable, and with sufficient color contrast; pin types shouldn't rely on color alone (use shape/outline too).
- Scientific tone in all copy: no exaggerated claims, limitations always visible.
- A README with setup steps, env variables, data sources, and image licensing notes.
- Unit tests for the matching and ranking rules in §5 and the favourites filtering/folder logic in §6.

## 11. Phases

1. Scaffold the project, landing screen (Pleiades background), and auth + guest mode
2. Target selection + Cesium globe with pins (three pin types, legend)
3. Data schema + seed dataset with verified sources and real images
4. Side panel with image comparison, similarities, limitations, references
5. Filters, matching rules, ranking, rank badges on pins + tests
6. Saved searches + Favourites panel with folders and filtering (logged-in users)
7. Discovery module slot + mock provider + docs

At the end of each phase, give me a short summary of what's done, what's missing, and anything you couldn't verify.
