import type { SiteOrigin } from "@/types/site";
import { asset } from "@/lib/asset";

/**
 * Pin artwork for the three site origins. Each type differs in SHAPE as well as colour,
 * so they stay distinguishable without colour vision:
 *  - nasa_official:     circular "NASA approved" badge with a white ring
 *  - literature:        classic teardrop map pin, neutral slate
 *  - hypatia_candidate: amber diamond with a dashed outline
 * Canvases are drawn at 2x and displayed at PIN_SIZE for crisp rendering on HiDPI screens.
 */

export const PIN_SIZE: Record<SiteOrigin, { width: number; height: number; anchor: "center" | "bottom" }> = {
  nasa_official: { width: 40, height: 40, anchor: "center" },
  literature: { width: 28, height: 38, anchor: "bottom" },
  hypatia_candidate: { width: 34, height: 34, anchor: "center" },
};

export const NASA_BADGE_URL = asset("/assets/nasa-approved-pin-128.png");

const PX = 2;
const cache = new Map<string, HTMLCanvasElement>();
let nasaBadge: HTMLImageElement | null = null;

export function loadPinAssets(): Promise<void> {
  if (nasaBadge) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      nasaBadge = img;
      resolve();
    };
    img.onerror = () => resolve(); // fall back to a drawn badge
    img.src = NASA_BADGE_URL;
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w * PX;
  c.height = h * PX;
  const ctx = c.getContext("2d")!;
  ctx.scale(PX, PX);
  return { c, ctx };
}

function drawNasa(): HTMLCanvasElement {
  const { width: w, height: h } = PIN_SIZE.nasa_official;
  const { c, ctx } = canvas(w, h);
  const r = w / 2;
  ctx.fillStyle = "rgba(3,5,11,0.55)";
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.clip();
  if (nasaBadge) {
    ctx.drawImage(nasaBadge, 3, 3, w - 6, h - 6);
  } else {
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NASA", r, r);
  }
  ctx.restore();
  return c;
}

function drawLiterature(): HTMLCanvasElement {
  const { width: w, height: h } = PIN_SIZE.literature;
  const { c, ctx } = canvas(w, h);
  const cx = w / 2;
  const r = w / 2 - 2;
  const cy = r + 2;
  ctx.beginPath();
  ctx.moveTo(cx, h - 1.5);
  ctx.bezierCurveTo(cx - 4, h - 12, cx - r, cy + r * 0.75, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(cx + r, cy + r * 0.75, cx + 4, h - 12, cx, h - 1.5);
  ctx.closePath();
  ctx.fillStyle = "#cbd5e1";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0f172a";
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function drawCandidate(): HTMLCanvasElement {
  const { width: w, height: h } = PIN_SIZE.hypatia_candidate;
  const { c, ctx } = canvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - 2;
  const diamond = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  };
  diamond();
  ctx.fillStyle = "#f59e0b";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1c1206";
  ctx.stroke();
  ctx.setLineDash([3, 2.5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#fff7e0";
  diamond();
  ctx.stroke();
  ctx.setLineDash([]);
  // Small four-point "discovery" sparkle.
  ctx.fillStyle = "#1c1206";
  ctx.beginPath();
  const s = r * 0.42;
  ctx.moveTo(cx, cy - s);
  ctx.quadraticCurveTo(cx, cy, cx + s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + s);
  ctx.quadraticCurveTo(cx, cy, cx - s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - s);
  ctx.fill();
  return c;
}

export function pinImage(origin: SiteOrigin): HTMLCanvasElement {
  const key = `${origin}:${nasaBadge ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = origin === "nasa_official" ? drawNasa() : origin === "literature" ? drawLiterature() : drawCandidate();
    cache.set(key, c);
  }
  return c;
}

function drawRankBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, rank: number, top: boolean) {
  const text = String(rank);
  ctx.font = "700 10px 'Inter Variable', system-ui, sans-serif";
  const w = Math.max(16, ctx.measureText(text).width + 8);
  const h = 16;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = top ? "#b9d4ff" : "#f1f5f9";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#03050b";
  ctx.stroke();
  ctx.fillStyle = "#03050b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 0.5);
}

export interface PinGraphic {
  image: HTMLCanvasElement;
  width: number;
  height: number;
  anchor: "center" | "bottom";
}

const BADGE_PAD = 9;
export const TOP_SCALE = 1.25;

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = "#fde68a";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#03050b";
  ctx.stroke();
}

export interface PinDecorations {
  /** Rank in the full ranking (filters active). */
  rank?: number;
  /** Top-10 emphasis: larger pin with a glow ring. */
  top?: boolean;
  /** Saved by the user: filled star at the top-left. */
  favourite?: boolean;
}

/**
 * Pin graphic with optional rank badge, top-10 emphasis and favourite star. Emphasis never
 * relies on colour alone (size, ring, badge, star shape). Padding keeps the anchor unchanged.
 */
export function pinGraphic(origin: SiteOrigin, d: PinDecorations = {}): PinGraphic {
  const base = PIN_SIZE[origin];
  const decorated = d.rank !== undefined || d.favourite;
  if (!decorated) return { image: pinImage(origin), width: base.width, height: base.height, anchor: base.anchor };
  const top = Boolean(d.top && d.rank !== undefined);
  const key = `pin:${origin}:${d.rank ?? ""}:${top ? 1 : 0}:${d.favourite ? 1 : 0}:${nasaBadge ? 1 : 0}`;
  const scale = top ? TOP_SCALE : 1;
  const pw = base.width * scale;
  const ph = base.height * scale;
  const pad = BADGE_PAD;
  const width = pw + pad * 2;
  const height = ph + pad + (base.anchor === "bottom" ? 0 : pad);
  let c = cache.get(key);
  if (!c) {
    const made = canvas(width, height);
    c = made.c;
    const ctx = made.ctx;
    if (top) {
      ctx.save();
      ctx.shadowColor = "rgba(185,212,255,0.95)";
      ctx.shadowBlur = 9;
      ctx.drawImage(pinImage(origin), pad, pad, pw, ph);
      ctx.restore();
    }
    ctx.drawImage(pinImage(origin), pad, pad, pw, ph);
    if (d.rank !== undefined) drawRankBadge(ctx, pad + pw - 2, pad + 2, d.rank, top);
    if (d.favourite) drawStar(ctx, pad + 1, pad + 1, 7.5);
    cache.set(key, c);
  }
  return { image: c, width, height, anchor: base.anchor };
}

export const CLUSTER_SIZE = 38;

/** Cluster marker with the number of pins; with filters active it also shows the best rank inside. */
export function clusterImage(count: number, bestRank?: number): HTMLCanvasElement {
  const key = `cluster:${count}:${bestRank ?? ""}`;
  let c = cache.get(key);
  if (c) return c;
  const s = CLUSTER_SIZE;
  const made = canvas(s, s);
  c = made.c;
  const ctx = made.ctx;
  const r = s / 2;
  ctx.fillStyle = "rgba(185,212,255,0.25)";
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0d1424";
  ctx.strokeStyle = "#b9d4ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 13px 'Inter Variable', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), r, r + 0.5);
  if (bestRank !== undefined) drawRankBadge(ctx, s - 9, 8, bestRank, true);
  cache.set(key, c);
  return c;
}
