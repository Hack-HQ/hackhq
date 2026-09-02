"use client";

import { useEffect, useRef, useState } from "react";
import type { GalleryTileItem, PackedGallery } from "@/lib/gallery";
import { submitGalleryPhotoUrl } from "@/lib/types-hq";

/* Infinite draggable canvas of the community's hackathon photos.

   Photos come from gallery.json (via loadGalleryPhotos on the server), and the
   server also runs packGalleryTiles and hands the packed result down. That is
   deliberate: GalleryPhoto carries the submitter's credit name and credit URL,
   so a GalleryPhoto[] prop would serialize both into the flight payload even
   though nothing here renders them.

   The pack is one seamless tile - the hand-tuned 6×6 slot template, stacked
   vertically when there are more than eight photos - repeated across a grid
   large enough to cover the viewport plus a margin. The pan offset is wrapped
   modulo the tile period, so the pattern repeats forever.

   Photo submission is handled on GitHub rather than by an on-site form: the
   image itself can't ride along in issue query params, so a form here could
   only ever collect the text and hand the visitor off anyway. The empty state
   links straight to the prefilled gallery_photo.yaml issue. */

const CW = 138; // base cell size (px)
const G = 8; // gap between cells / tiles

function Tile({
  items,
  cols,
  rows,
  tileW,
  tileH,
}: {
  items: GalleryTileItem[];
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
}) {
  return (
    <div
      className="grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${CW}px)`,
        gridTemplateRows: `repeat(${rows}, ${CW}px)`,
        gap: `${G}px`,
        width: tileW,
        height: tileH,
      }}
    >
      {items.map((it) => (
        <div
          key={it.key}
          className="overflow-hidden rounded-lg bg-ink-soft"
          style={{
            gridColumn: `${it.col} / span ${it.colSpan}`,
            gridRow: `${it.row} / span ${it.rowSpan}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={it.src}
            alt={it.alt}
            draggable={false}
            // The wall sits below the fold, and every tile repeats the same
            // handful of URLs - so deferring costs one set of fetches when the
            // gallery is first scrolled to, and every other tile is a cache
            // hit. Eager loading pulled the whole set during initial page load
            // instead, competing with the content above it (#299).
            loading="lazy"
            decoding="async"
            className="pointer-events-none h-full w-full select-none object-cover"
          />
        </div>
      ))}
    </div>
  );
}

export function GalleryCanvas({ gallery: packed }: { gallery: PackedGallery }) {
  const tileW = packed.cols * CW + (packed.cols - 1) * G;
  const tileH = packed.rows * CW + (packed.rows - 1) * G;
  const periodX = tileW + G;
  const periodY = tileH + G;

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
    el.style.transform = `translate3d(${wrap(st.current.ox, periodX)}px, ${wrap(
      st.current.oy,
      periodY,
    )}px, 0)`;
  };

  useEffect(() => {
    const s = st.current;
    const measure = () => {
      const el = canvasRef.current;
      if (!el) return;
      setGrid({
        cols: Math.ceil(el.clientWidth / tileW) + 2,
        rows: Math.ceil(el.clientHeight / tileH) + 2,
      });
    };
    measure();
    apply();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(s.raf);
    };
    // Re-measure when the packed tile size changes (more photos → taller tile).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply closes over periodX/Y
  }, [tileW, tileH, periodX, periodY]);

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
  const empty = packed.items.length === 0;

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
        aria-label="Photo wall from community hackathons - drag to explore"
        className="shell relative h-[clamp(440px,76vh,820px)] cursor-grab touch-none select-none bg-ink-deep active:cursor-grabbing"
        onPointerDown={empty ? undefined : onDown}
        onPointerMove={empty ? undefined : onMove}
        onPointerUp={empty ? undefined : onUp}
        onPointerCancel={empty ? undefined : onUp}
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-display text-lg text-paper/70">
              No photos yet - be the first.
            </p>
            <p className="max-w-sm text-sm text-paper/40">
              <a
                href={submitGalleryPhotoUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-coral underline-offset-4 hover:underline"
              >
                Share a photo
              </a>{" "}
              to open a GitHub issue and attach a JPG or PNG.
            </p>
          </div>
        ) : (
          <div
            ref={worldRef}
            className="absolute left-0 top-0 grid will-change-transform"
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, ${tileW}px)`,
              gap: `${G}px`,
            }}
          >
            {tiles.map((_, i) => (
              <Tile
                key={i}
                items={packed.items}
                cols={packed.cols}
                rows={packed.rows}
                tileW={tileW}
                tileH={tileH}
              />
            ))}
          </div>
        )}

        {/* edge vignette so the wall fades into the shell */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_120px_40px_rgba(10,9,9,0.75)]"
        />
      </div>
    </section>
  );
}
