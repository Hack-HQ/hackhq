"use client";

import { useEffect, useRef, useState } from "react";

/* Infinite draggable canvas of the community's hackathon photos.

   The photos pack into one seamless 6×6 tile (cells matched to each image's
   orientation — portraits in tall cells, landscapes in wide ones). That tile is
   repeated across a grid large enough to cover the viewport plus a margin, and
   the whole world is panned by dragging. The pan offset is wrapped modulo the
   tile period, so the pattern repeats forever in every direction. */

const BASE = "/repo-assets/gallery/";

type Item = {
  src: string;
  col: number;
  colSpan: number;
  row: number;
  rowSpan: number;
};

// Every cell of the 6×6 grid is filled exactly once, so the tile is a perfect
// rectangle and butts seamlessly against its own copies.
const TILE_ITEMS: Item[] = [
  { src: "lahacks-ucla", col: 1, colSpan: 2, row: 1, rowSpan: 3 }, // portrait
  { src: "code-and-tell", col: 3, colSpan: 2, row: 1, rowSpan: 2 }, // landscape
  { src: "library-coding", col: 5, colSpan: 1, row: 1, rowSpan: 2 }, // tall
  { src: "bostonhacks", col: 6, colSpan: 1, row: 1, rowSpan: 3 }, // tall
  { src: "hackpsu", col: 3, colSpan: 3, row: 3, rowSpan: 2 }, // landscape
  { src: "gtm-hackathon", col: 1, colSpan: 2, row: 4, rowSpan: 3 }, // portrait
  { src: "gtm-welcome", col: 6, colSpan: 1, row: 4, rowSpan: 3 }, // tall
  { src: "yhack", col: 3, colSpan: 3, row: 5, rowSpan: 2 }, // landscape
];

const CW = 138; // base cell size (px)
const G = 8; // gap between cells / tiles
const COLS = 6;
const ROWS = 6;
const TILE_W = COLS * CW + (COLS - 1) * G;
const TILE_H = ROWS * CW + (ROWS - 1) * G;
const PERIOD_X = TILE_W + G;
const PERIOD_Y = TILE_H + G;

function Tile() {
  return (
    <div
      className="grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(${COLS}, ${CW}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${CW}px)`,
        gap: `${G}px`,
        width: TILE_W,
        height: TILE_H,
      }}
    >
      {TILE_ITEMS.map((it) => (
        <div
          key={it.src}
          className="overflow-hidden rounded-lg bg-ink-soft"
          style={{
            gridColumn: `${it.col} / span ${it.colSpan}`,
            gridRow: `${it.row} / span ${it.rowSpan}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE}${it.src}.jpg`}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-cover"
          />
        </div>
      ))}
    </div>
  );
}

export function GalleryCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const st = useRef({
    ox: 0,
    oy: 0,
    dragging: false,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    raf: 0,
  });
  // How many tiles to render — enough to cover the canvas plus one tile of
  // margin in each direction so the wrap never exposes an edge.
  const [grid, setGrid] = useState({ cols: 4, rows: 4 });

  const apply = () => {
    const el = worldRef.current;
    if (!el) return;
    const wrap = (v: number, p: number) => (((v % p) + p) % p) - p;
    el.style.transform = `translate3d(${wrap(st.current.ox, PERIOD_X)}px, ${wrap(
      st.current.oy,
      PERIOD_Y,
    )}px, 0)`;
  };

  useEffect(() => {
    const s = st.current;
    const measure = () => {
      const el = canvasRef.current;
      if (!el) return;
      setGrid({
        cols: Math.ceil(el.clientWidth / TILE_W) + 2,
        rows: Math.ceil(el.clientHeight / TILE_H) + 2,
      });
    };
    measure();
    apply();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(s.raf);
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(st.current.raf);
    const s = st.current;
    s.dragging = true;
    s.px = e.clientX;
    s.py = e.clientY;
    s.vx = 0;
    s.vy = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    s.ox += dx;
    s.oy += dy;
    s.px = e.clientX;
    s.py = e.clientY;
    s.vx = dx;
    s.vy = dy;
    apply();
  };

  const onUp = () => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    // Glide on release, decaying the release velocity.
    const step = () => {
      s.ox += s.vx;
      s.oy += s.vy;
      s.vx *= 0.92;
      s.vy *= 0.92;
      apply();
      if (Math.abs(s.vx) > 0.2 || Math.abs(s.vy) > 0.2) {
        s.raf = requestAnimationFrame(step);
      }
    };
    s.raf = requestAnimationFrame(step);
  };

  const tiles = Array.from({ length: grid.cols * grid.rows });

  return (
    <section className="p-2 pt-20">
      <div className="mb-3 flex items-end justify-between px-2">
        <div>
          <div className="kicker text-coral">The community · In the wild</div>
          <h2 className="display mt-3 text-[clamp(2rem,5vw,3.4rem)] text-paper">
            The gallery
          </h2>
        </div>
        <span className="kicker hidden text-paper/35 sm:block">
          Drag to explore ↔
        </span>
      </div>

      <div
        ref={canvasRef}
        aria-label="Photo wall from community hackathons — drag to explore"
        className="shell relative h-[clamp(440px,76vh,820px)] cursor-grab touch-none select-none bg-ink-deep active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          ref={worldRef}
          className="absolute left-0 top-0 grid will-change-transform"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, ${TILE_W}px)`,
            gap: `${G}px`,
          }}
        >
          {tiles.map((_, i) => (
            <Tile key={i} />
          ))}
        </div>

        {/* edge vignette so the wall fades into the shell */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_120px_40px_rgba(10,9,9,0.75)]"
        />
      </div>
    </section>
  );
}
