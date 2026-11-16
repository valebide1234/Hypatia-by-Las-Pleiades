// Loads data/sites.json into the Supabase `analog_sites` table (upsert by id).
// Needs the SERVICE ROLE key, which bypasses RLS. Never expose it to the browser
// (it must not start with VITE_).
//
// Usage:
//   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs [--dry-run]
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const { version, sites } = JSON.parse(await readFile(new URL("../data/sites.json", import.meta.url), "utf8"));

const rows = sites.map((s) => ({
  id: s.id,
  name: s.name,
  country: s.country,
  lat: s.lat,
  lon: s.lon,
  origin: s.origin,
  targets: s.targets,
  data: s,
  dataset_version: version,
  updated_at: new Date().toISOString(),
}));

if (dryRun) {
  console.log(`[dry run] would upsert ${rows.length} sites (dataset v${version}).`);
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.from("analog_sites").upsert(rows, { onConflict: "id" });
if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}
console.log(`Upserted ${rows.length} sites (dataset v${version}).`);
