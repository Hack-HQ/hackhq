"use client";

import { useEffect, useRef, useState } from "react";

export type Flyer = {
  /** Path under /public, e.g. "/flyers/hackmit.jpg". Optional — falls back to a styled cover. */
  src?: string;
  /** Big organization / event name — shown on the active card panel + used for alt text. */
  title: string;
  /** Category label (e.g. status) shown above the name on the active card. */
  caption: string;
  /** Optional accent colour for the fallback cover glow. */
  accent?: string;
};

// How much vertical scroll (in vh) each flyer occupies. Bigger = slower rotation.
const PER_CARD_VH = 78;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Deterministic pseudo-random in [-1, 1] from an index — for stable scatter. */
function seeded(i: number): number {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Coverflow-ish transform for a card `offset` = index - progress from centre. */
function cardStyle(offset: number, i: number): React.CSSProperties {
  const abs = Math.abs(offset);
  const dir = Math.sign(offset);

  // Heavy horizontal overlap; far cards compress toward the edges.
  const x = dir * (abs <= 1 ? abs * 25 : 25 + (abs - 1) * 9); // vw
  const scale =
    abs <= 1 ? 1 - abs * 0.34 : clamp(0.66 - (abs - 1) * 0.12, 0.4, 1);
  const opacity =
    abs <= 1 ? 1 - abs * 0.08 : clamp(0.92 - (abs - 1) * 0.4, 0, 1);
  const gray = clamp(abs, 0, 1); // active in colour, rest greyscale
  const bright = 1 - clamp(abs, 0, 1) * 0.42;
  const blur = abs <= 1 ? 0 : clamp((abs - 1) * 2.6, 0, 9);

  // Cards settle upright + centred when active; scatter as they recede.
  const settle = Math.min(abs, 1.2);
  const jitterY = seeded(i) * 7 * settle; // vh
  const rot = seeded(i + 7) * 5 * Math.min(abs, 1); // deg

  return {
    transform: `translate(-50%, -50%) translate(${x}vw, ${jitterY}vh) scale(${scale}) rotate(${rot}deg)`,
    opacity,
    filter: `grayscale(${gray}) brightness(${bright}) blur(${blur}px)`,
    zIndex: 100 - Math.round(abs * 10),
  };
}

function FlyerCover({ flyer }: { flyer: Flyer }) {
  const monogram = flyer.title.trim().charAt(0).toUpperCase();
  const accent = flyer.accent ?? "#f97316";
  if (flyer.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- flyers are arbitrary user-dropped assets; plain <img> keeps the coverflow simple
      <img
        src={flyer.src}
        alt={flyer.title}
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        backgroundColor: "#0c0b0b",
        backgroundImage: `radial-gradient(120% 120% at 78% 8%, ${accent}33, transparent 55%), linear-gradient(155deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))`,
      }}
    >
      <span
        className="select-none font-semibold text-white/12"
        style={{ fontSize: "9rem", lineHeight: 1 }}
        aria-hidden
      >
        {monogram}
      </span>
    </div>
  );
}

export function ScrollGallery({
  flyers,
  eyebrow = "The wall",
  title = "Every flyer, one scroll",
  description = "Every hackathon we track, laid out as a living wall. Scroll to move through the deck — the flyer in focus tells you who's building and when.",
}: {
  flyers: Flyer[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const n = flyers.length;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || n <= 1) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      const scrolled = clamp(-rect.top, 0, total);
      setProgress(total > 0 ? (scrolled / total) * (n - 1) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [n]);

  if (n === 0) return null;

  const active = clamp(Math.round(progress), 0, n - 1);

  return (
    <section id="gallery" className="w-full">
      <div
        ref={wrapRef}
        style={{ height: `${Math.max(2, n) * PER_CARD_VH + 100}vh` }}
      >
        <div className="gallery-stage sticky top-0 h-[100svh] w-full">
          <div className="gallery-shell">
            {/* Ambient backdrop that mirrors the active flyer */}
            <div
              key={active}
              aria-hidden
              className="gallery-backdrop absolute inset-0"
              style={{
                backgroundImage: flyers[active].src
                  ? `url(${flyers[active].src})`
                  : undefined,
              }}
            />

            {/* Header: title left, description right */}
            <div className="gallery-header">
              <div>
                <p className="gallery-eyebrow">{eyebrow}</p>
                <h2 className="gallery-title">{title}</h2>
              </div>
              <p className="gallery-desc">{description}</p>
            </div>

            {/* The deck */}
            <div className="absolute inset-0">
              {flyers.map((flyer, i) => {
                const offset = i - progress;
                if (Math.abs(offset) > 4) return null; // cull far cards
                const isActive = i === active;
                return (
                  <figure
                    key={i}
                    className="gallery-card absolute left-1/2 top-1/2"
                    style={cardStyle(offset, i)}
                  >
                    <div className="gallery-card__frame">
                      <FlyerCover flyer={flyer} />
                      <span className="gallery-card__num">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {isActive && (
                        <div className="gallery-card__panel">
                          <p className="gallery-card__cat">{flyer.caption}</p>
                          <p className="gallery-card__name">{flyer.title}</p>
                        </div>
                      )}
                    </div>
                  </figure>
                );
              })}
            </div>

            {/* Counter, bottom-right */}
            <div className="absolute bottom-8 right-6 z-[200] min-[1200px]:right-12">
              <span className="gallery-counter">
                {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
