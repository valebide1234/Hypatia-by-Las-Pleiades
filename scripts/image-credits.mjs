// Regenerates docs/IMAGE_CREDITS.md from data/sites.json (every image with credit + licence).
// Usage: node scripts/image-credits.mjs
import { readFile, writeFile } from "node:fs/promises";

const { version, sites } = JSON.parse(await readFile(new URL("../data/sites.json", import.meta.url), "utf8"));
const seen = new Map();
for (const s of sites) {
  for (const img of [...s.images.earth, ...s.images.target]) {
    const e = seen.get(img.url) ?? { img, sites: [] };
    e.sites.push(s.id);
    seen.set(img.url, e);
  }
}
const esc = (t) => String(t ?? "").replace(/\|/g, "\\|");
const rows = [...seen.values()]
  .sort((a, b) => a.img.url.localeCompare(b.img.url))
  .map(({ img, sites }) =>
    `| \`${img.url.split("/").pop()}\` | ${esc(img.instrument)} | ${esc(img.date)} | ${esc(img.credit)} | ${esc(img.license)} | [source](${img.sourceUrl}) | ${sites.join(", ")} |`,
  );
const md = `# Image credits

Generated from \`data/sites.json\` (dataset v${version}) by \`node scripts/image-credits.mjs\`. Do not edit by hand.

All images are real photographs or remote-sensing data, downloaded into \`public/images/sites/\` (resized, and some panoramas cropped; never upscaled or retouched). Licences: public domain (NASA/USGS/BLM), CC0, CC BY or CC BY-SA. CC BY-SA images keep their licence when redistributed.

| File | Instrument / mission | Date | Credit | Licence | Original | Used by |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
await writeFile(new URL("../docs/IMAGE_CREDITS.md", import.meta.url), md);
console.log(`Wrote ${seen.size} image credits.`);
