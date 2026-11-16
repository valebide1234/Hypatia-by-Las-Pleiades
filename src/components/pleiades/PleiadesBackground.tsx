import { useEffect, useRef } from "react";
import { mulberry32, projectCluster, relativeFlux, type ProjectedStar } from "./pleiadesStars";

/**
 * Procedural, full-screen sky inspired by the Pleiades (M45).
 * - The bright members are placed at their real relative positions (see pleiadesStars.ts).
 * - The blue reflection-nebula haze and its faint striations are drawn with seeded gradients.
 * - Faint field stars twinkle and drift slowly; the pointer adds a little parallax.
 * - With prefers-reduced-motion the sky is rendered once, statically.
 */

interface FieldStar {
  x: number; // 0..1 of the drift tile
  y: number;
  r: number;
  alpha: number;
  depth: number; // parallax / drift factor 0.2..1
  phase: number;
  speed: number;
  tint: string;
}

interface Layout {
  w: number;
  h: number;
  dpr: number;
  cx: number;
  cy: number;
  scale: number;
}

const SEED = 45; // M45
const FIELD_TINTS = ["#ffffff", "#e6eeff", "#cfdcff", "#fff4e6", "#ffe9d6"];

function computeLayout(w: number, h: number, dpr: number): Layout {
  // The cluster sits in the upper part of the screen so the title block stays legible.
  const portrait = h > w;
  const scale = Math.min(w * (portrait ? 0.82 : 0.52), h * (portrait ? 0.5 : 0.64));
  return { w, h, dpr, cx: w * 0.5, cy: h * (portrait ? 0.27 : 0.3), scale };
}

function buildFieldStars(w: number, h: number): FieldStar[] {
  const rand = mulberry32(SEED * 7919);
  const count = Math.round(Math.min(1100, Math.max(260, (w * h) / 2100)));
  const stars: FieldStar[] = [];
  for (let i = 0; i < count; i++) {
    // Power-law brightness: many faint stars, few brighter ones.
    const b = Math.pow(rand(), 3.2);
    stars.push({
      x: rand(),
      y: rand(),
      r: 0.35 + b * 1.25,
      alpha: 0.18 + b * 0.75,
      depth: 0.2 + rand() * 0.8,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 1.6,
      tint: FIELD_TINTS[Math.floor(rand() * FIELD_TINTS.length)]!,
    });
  }
  return stars;
}

/** Draws the reflection nebula once into an offscreen canvas (expensive part). */
function renderNebula(layout: Layout, cluster: ProjectedStar[]): HTMLCanvasElement {
  const { w, h, dpr, cx, cy, scale } = layout;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
  ctx.globalCompositeOperation = "lighter";
  const rand = mulberry32(SEED);

  // Broad diffuse glow enveloping the whole cluster.
  const broad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.85);
  broad.addColorStop(0, "rgba(70,110,200,0.16)");
  broad.addColorStop(0.45, "rgba(40,70,150,0.08)");
  broad.addColorStop(1, "rgba(10,20,50,0)");
  ctx.fillStyle = broad;
  ctx.fillRect(0, 0, w, h);

  // Haze concentrated around each bright star (Merope's nebula, NGC 1435, is the brightest).
  for (const s of cluster) {
    const sx = cx + s.x * scale;
    const sy = cy + s.y * scale;
    const flux = relativeFlux(s.vmag);
    const boost = s.name === "Merope" ? 1.9 : s.name === "Maia" || s.name === "Electra" ? 1.25 : 1;
    const radius = scale * (0.09 + 0.16 * Math.sqrt(flux)) * boost;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    const a = Math.min(0.22, 0.07 + 0.12 * flux) * boost;
    g.addColorStop(0, `rgba(150,190,255,${a})`);
    g.addColorStop(0.35, `rgba(90,140,240,${a * 0.5})`);
    g.addColorStop(1, "rgba(40,80,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine, roughly parallel striations seen in long-exposure photographs of the cluster.
  const angle = (-32 * Math.PI) / 180;
  for (let i = 0; i < 260; i++) {
    const anchor = cluster[Math.floor(rand() * cluster.length)]!;
    const gx = (rand() + rand() + rand() - 1.5) * 0.34;
    const gy = (rand() + rand() + rand() - 1.5) * 0.3;
    const px = cx + (anchor.x + gx) * scale;
    const py = cy + (anchor.y + gy) * scale;
    const len = scale * (0.05 + rand() * 0.22);
    const thin = 0.05 + rand() * 0.09;
    const alpha = 0.01 + rand() * 0.026;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + (rand() - 0.5) * 0.25);
    ctx.scale(1, thin);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, `rgba(140,180,255,${alpha})`);
    g.addColorStop(1, "rgba(60,100,210,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dark vignette so edges recede into deep space.
  ctx.globalCompositeOperation = "source-over";
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vig.addColorStop(0, "rgba(3,5,11,0)");
  vig.addColorStop(1, "rgba(3,5,11,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function drawBrightStar(ctx: CanvasRenderingContext2D, x: number, y: number, s: ProjectedStar, scale: number, twinkle: number) {
  const flux = relativeFlux(s.vmag);
  const unit = Math.max(0.6, scale / 900);
  const core = (1.2 + 3.4 * Math.sqrt(flux)) * unit;
  const halo = core * 7;

  const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * twinkle})`);
  g.addColorStop(0.08, `rgba(225,236,255,${0.85 * twinkle})`);
  g.addColorStop(0.22, `rgba(160,195,255,${0.32 * twinkle})`);
  g.addColorStop(1, "rgba(90,140,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, Math.PI * 2);
  ctx.fill();

  // Subtle four-point diffraction spikes for the brightest members only.
  if (s.vmag < 4.5) {
    const len = core * (6 + 10 * flux);
    ctx.save();
    ctx.globalAlpha = 0.28 * twinkle;
    ctx.strokeStyle = "rgba(200,220,255,1)";
    ctx.lineWidth = Math.max(0.5, unit * 0.7);
    ctx.beginPath();
    ctx.moveTo(x - len, y);
    ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - len);
    ctx.lineTo(x, y + len);
    ctx.stroke();
    ctx.restore();
  }
}

export default function PleiadesBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const cluster = projectCluster();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    let layout: Layout;
    let field: FieldStar[] = [];
    let nebula: HTMLCanvasElement | null = null;
    let raf = 0;
    const start = performance.now();
    const pointer = { tx: 0, ty: 0, x: 0, y: 0 };

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      layout = computeLayout(w, h, dpr);
      field = buildFieldStars(w, h);
      nebula = renderNebula(layout, cluster);
    };

    const draw = (now: number) => {
      const { w, h, dpr, cx, cy, scale } = layout;
      const t = reduceMotion ? 0 : (now - start) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#04070f");
      bg.addColorStop(0.5, "#060a17");
      bg.addColorStop(1, "#03050b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Field stars: slow diagonal drift, wrapped on a tile larger than the viewport.
      const driftX = t * 3.2;
      const driftY = t * 1.1;
      const tileW = w + 40;
      const tileH = h + 40;
      for (const s of field) {
        const px = (((s.x * tileW + driftX * s.depth + pointer.x * 14 * s.depth) % tileW) + tileW) % tileW - 20;
        const py = (((s.y * tileH + driftY * s.depth + pointer.y * 14 * s.depth) % tileH) + tileH) % tileH - 20;
        const tw = reduceMotion ? 1 : 0.72 + 0.28 * Math.sin(t * s.speed + s.phase);
        ctx.globalAlpha = s.alpha * tw;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Cluster + nebula: a nearer layer, so it moves a touch more with the pointer.
      const ox = pointer.x * 22;
      const oy = pointer.y * 22;
      if (nebula) ctx.drawImage(nebula, ox, oy, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < cluster.length; i++) {
        const s = cluster[i]!;
        const tw = reduceMotion ? 1 : 0.93 + 0.07 * Math.sin(t * (0.9 + i * 0.13) + i * 1.7);
        drawBrightStar(ctx, cx + s.x * scale + ox, cy + s.y * scale + oy, s, scale, tw);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const startRendering = () => {
      cancelAnimationFrame(raf);
      if (reduceMotion) {
        pointer.tx = pointer.ty = pointer.x = pointer.y = 0;
        draw(performance.now());
      } else {
        raf = requestAnimationFrame(loop);
      }
    };

    const onResize = () => {
      setup();
      startRendering();
    };
    const onPointer = (e: PointerEvent) => {
      if (reduceMotion) return;
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
    };
    const onMotionPref = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      startRendering();
    };

    setup();
    startRendering();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    motionQuery.addEventListener("change", onMotionPref);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      motionQuery.removeEventListener("change", onMotionPref);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 block h-full w-full bg-space-950" />;
}
