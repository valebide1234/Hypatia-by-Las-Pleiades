// Converts public/assets/nasa-approved-pin.jpg (circular badge on a white square) into
// transparent PNGs at several sizes. The circle is found from the bounding box of the
// non-white pixels, so slight off-centre crops still work.
// Usage: node scripts/make-nasa-pin.mjs
import sharp from "sharp";

const SRC = "public/assets/nasa-approved-pin.jpg";
const SIZES = [32, 48, 64, 128];
const WHITE = 232; // channel threshold for "background white"

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (data[i] < WHITE || data[i + 1] < WHITE || data[i + 2] < WHITE) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const r = Math.min(maxX - minX, maxY - minY) / 2;
const side = Math.floor(r * 2);
const left = Math.max(0, Math.round(cx - r));
const top = Math.max(0, Math.round(cy - r));
console.log(`badge circle: centre (${cx}, ${cy}), radius ${r.toFixed(1)} px`);

const square = await sharp(SRC)
  .extract({ left, top, width: Math.min(side, info.width - left), height: Math.min(side, info.height - top) })
  .toBuffer();

for (const size of SIZES) {
  // Mask circle inset by ~1.5% so no white fringe survives at the edge.
  const rr = (size / 2) * 0.985;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${rr}" fill="#fff"/></svg>`,
  );
  const out = `public/assets/nasa-approved-pin-${size}.png`;
  await sharp(square)
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out);
}
