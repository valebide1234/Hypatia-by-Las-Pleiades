import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTour } from "@/store/tour";
import { TOURS, tourForPath, type TourStep } from "@/tour/steps";
import { useT } from "@/i18n";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
type Side = "top" | "bottom" | "left" | "right";
interface Placement {
  left: number;
  top: number;
  /** Side of the element the note sits on; null when it overlaps the element or is centred. */
  side: Side | null;
}

const GAP = 14;
const MARGIN = 12;
const PAD = 6;
const CARD_WIDTH = 360;
/** Free space above or below a large element that is enough to put the note there, overlapping its edge. */
const OVERLAP_MIN_ROOM = 96;

function findTarget(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  // The first visible match: an element can be rendered twice (e.g. a hidden mobile variant).
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const clips = (el: HTMLElement) => /(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowY);

/** Scrolls the nearest scrolling ancestor so the element starts near its top. */
function reveal(el: HTMLElement) {
  let parent = el.parentElement;
  while (parent) {
    const p: HTMLElement = parent;
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) {
      const offset = el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop;
      p.scrollTo({ top: Math.max(0, offset - 16) });
      return;
    }
    parent = p.parentElement;
  }
}

/** The part of the element that is actually on screen (inside every clipping ancestor), padded. */
function visibleBox(el: HTMLElement): Box | null {
  const r = el.getBoundingClientRect();
  let top = r.top;
  let left = r.left;
  let right = r.right;
  let bottom = r.bottom;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (!clips(p)) continue;
    const c = p.getBoundingClientRect();
    top = Math.max(top, c.top);
    left = Math.max(left, c.left);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  top = Math.max(top, 0);
  left = Math.max(left, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  if (right - left < 8 || bottom - top < 8) return null;
  return { top: top - PAD, left: left - PAD, width: right - left + 2 * PAD, height: bottom - top + 2 * PAD };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** Where the note goes: on the preferred side if it fits, otherwise wherever there is room. */
function placeCard(box: Box | null, card: { width: number; height: number }, prefer: TourStep["placement"]): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - card.width - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - card.height - MARGIN);
  if (!box) return { left: clampX((vw - card.width) / 2), top: clampY((vh - card.height) / 2), side: null };

  const room = {
    bottom: vh - (box.top + box.height) - GAP - MARGIN,
    top: box.top - GAP - MARGIN,
    right: vw - (box.left + box.width) - GAP - MARGIN,
    left: box.left - GAP - MARGIN,
  };
  const fits = (side: Side) => (side === "top" || side === "bottom" ? room[side] >= card.height : room[side] >= card.width);
  const order = [prefer, "bottom", "right", "left", "top"].filter(Boolean) as Side[];
  const side = order.find(fits);
  const centreX = clampX(box.left + (box.width - card.width) / 2);
  const centreY = clampY(box.top + (box.height - card.height) / 2);
  if (!side) {
    // Nearly fits above or below: go there and overlap the element's edge rather than its middle.
    if (room.top >= OVERLAP_MIN_ROOM || room.bottom >= OVERLAP_MIN_ROOM) {
      return { left: centreX, top: room.top >= room.bottom ? MARGIN : vh - card.height - MARGIN, side: null };
    }
    // The element fills the screen (the globe): put the note inside it, bottom centre.
    return { left: centreX, top: clampY(box.top + box.height - card.height - 2 * GAP), side: null };
  }
  if (side === "bottom") return { left: centreX, top: box.top + box.height + GAP, side };
  if (side === "top") return { left: centreX, top: box.top - GAP - card.height, side };
  if (side === "right") return { left: box.left + box.width + GAP, top: centreY, side };
  return { left: box.left - GAP - card.width, top: centreY, side };
}

/** Small arrow on the edge of the note, pointing at the middle of the highlighted element. */
function Caret({ pos, box, card }: { pos: Placement; box: Box; card: { width: number; height: number } }) {
  if (!pos.side) return null;
  const along = (centre: number, start: number, size: number) => Math.min(Math.max(centre - start, 22), size - 22) - 6;
  const base = "absolute h-3 w-3 rotate-45 border-white/15 bg-space-900";
  if (pos.side === "bottom") return <span aria-hidden="true" className={`${base} border-l border-t`} style={{ top: -6.5, left: along(box.left + box.width / 2, pos.left, card.width) }} />;
  if (pos.side === "top") return <span aria-hidden="true" className={`${base} border-b border-r`} style={{ bottom: -6.5, left: along(box.left + box.width / 2, pos.left, card.width) }} />;
  if (pos.side === "right") return <span aria-hidden="true" className={`${base} border-b border-l`} style={{ left: -6.5, top: along(box.top + box.height / 2, pos.top, card.height) }} />;
  return <span aria-hidden="true" className={`${base} border-r border-t`} style={{ right: -6.5, top: along(box.top + box.height / 2, pos.top, card.height) }} />;
}

/**
 * Guided tour overlay: dims the page, lights up one element at a time and shows a note beside
 * it with Back, Next and Skip. It starts by itself the first time a page is visited (see
 * useTour) and again on request from the "Tour" button.
 */
export default function Tour() {
  const { active, index, skip, stop } = useTour();
  // Optional steps describe things that depend on how the app is set up; pass over the absent ones.
  const next = useCallback(() => useTour.getState().next((s) => !findTarget(s)), []);
  const back = useCallback(() => useTour.getState().back((s) => !findTarget(s)), []);
  const { pathname } = useLocation();
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const settled = useRef<TourStep | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const [size, setSize] = useState({ width: CARD_WIDTH, height: 0 });

  const steps = active ? TOURS[active] : [];
  const step = steps[index];

  // A tour belongs to one page: stop it if the page changes underneath.
  useEffect(() => {
    if (active && tourForPath(pathname) !== active) stop();
  }, [active, pathname, stop]);

  // Follow the highlighted element: it appears a moment after its panel opens, and it moves
  // when panels slide or the window is resized.
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      const el = findTarget(step);
      if (el && settled.current !== step) {
        settled.current = step;
        reveal(el);
        nextRef.current?.focus({ preventScroll: true }); // a panel that just opened takes the focus
      }
      const nextBox = el ? visibleBox(el) : null;
      setBox((cur) => (sameBox(cur, nextBox) ? cur : nextBox));
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!step || !card) return;
    const dims = { width: card.offsetWidth, height: card.offsetHeight };
    setSize(dims);
    setPos(placeCard(box, dims, step.placement));
  }, [box, step]);

  useEffect(() => {
    if (!step) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const inCard = cardRef.current?.contains(document.activeElement) ?? false;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        skip();
      } else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if ((e.key === "Enter" || e.key === " " || e.key === "Tab") && !inCard) {
        // The page under the tour must not react to the keyboard: bring the focus back to the note.
        e.preventDefault();
        e.stopPropagation();
        nextRef.current?.focus({ preventScroll: true });
        if (e.key !== "Tab") next();
      } else if (e.key === "Tab") {
        // Keep Tab inside the note.
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, next, back, skip]);

  if (!active || !step) return null;
  // Steps that this installation cannot show are not counted.
  const shown = steps.filter((s) => s === step || !s.optional || findTarget(s));
  const at = shown.indexOf(step);
  const last = at === shown.length - 1;

  return (
    <div className="fixed inset-0 z-[100]" data-testid="tour">
      {/* Blocks the page while the tour runs; the lit area is cut out with a very large shadow. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl ring-2 ring-pleiad-300 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 200vmax rgba(3, 5, 11, 0.74), 0 0 0 6px rgba(185, 212, 255, 0.18), 0 0 28px 2px rgba(143, 184, 255, 0.35)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-space-950/75" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-2xl border border-white/15 bg-space-900 shadow-2xl shadow-black/60 transition-[left,top] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `min(${CARD_WIDTH}px, calc(100vw - ${2 * MARGIN}px))`, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      >
        {box && pos && <Caret pos={pos} box={box} card={size} />}
        <div key={`${active}:${index}`} className="tour-in p-5">
          <div className="flex items-center justify-between gap-3">
            <ol className="flex flex-wrap items-center gap-1" aria-hidden="true">
              {shown.map((s, i) => (
                <li key={s.title} className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-pleiad-300" : i < at ? "w-1.5 bg-pleiad-300/60" : "w-1.5 bg-white/20"}`} />
              ))}
            </ol>
            <p className="shrink-0 text-[11px] tabular-nums text-slate-400" aria-live="polite">
              <span className="sr-only">{t("Tour, step")} </span>
              {at + 1} <span aria-hidden="true">/</span>
              <span className="sr-only"> {t("of")} </span> {shown.length}
            </p>
          </div>
          <h2 id="tour-title" className="mt-3 font-display text-[1.65rem] leading-tight text-white">
            {t(step.title)}
          </h2>
          <p id="tour-body" className="mt-2 text-[13px] leading-relaxed text-slate-300">
            {t(step.body)}
          </p>
          <div className="mt-5 flex items-center gap-2">
            {!last && (
              <button type="button" onClick={skip} className="-ml-2 rounded-full px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white">
                {t("Skip tour")}
              </button>
            )}
            <span className="flex-1" />
            {index > 0 && (
              <button type="button" onClick={back} className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-slate-200 hover:border-white/50">
                {t("Back")}
              </button>
            )}
            <button ref={nextRef} type="button" onClick={next} className="rounded-full bg-pleiad-300 px-5 py-1.5 text-xs font-semibold text-space-950 hover:bg-white">
              {last ? t("Done") : t("Next")}
            </button>
          </div>
          <p className="mt-3 hidden text-[10px] text-slate-500 sm:block" aria-hidden="true">
            {t("← → to move · Esc to skip")}
          </p>
        </div>
      </div>
    </div>
  );
}
