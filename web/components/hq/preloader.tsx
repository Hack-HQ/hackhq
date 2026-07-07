"use client";

import { useEffect, useState } from "react";
import { lockScroll } from "@/lib/scroll-lock";

/**
 * Curtain-reveal load screen - native rebuild of the Framer
 * "Interactive Components/Preloader/LoadScreen" module:
 * five full-height coral columns (1px white/20 left borders) hold for a
 * beat, then collapse upward to 1% height, staggered from the center out,
 * with the module's dramatic cubic-bezier(1, 0, 0.56, 1) ease.
 */

// Collapse order from the original variants: middle → inner pair → outer pair.
const BAR_DELAYS_MS = [400, 200, 0, 200, 400];
const HOLD_MS = 1000;
const COLLAPSE_MS = 1000;
const TOTAL_MS = HOLD_MS + 400 + COLLAPSE_MS + 150;

export function Preloader() {
  const [collapsed, setCollapsed] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced-motion users skip the curtain. Deliberate post-mount decision
      // (matchMedia is unavailable during SSR, so this can't be a lazy init).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGone(true);
      return;
    }
    const release = lockScroll();
    const t1 = setTimeout(() => setCollapsed(true), HOLD_MS);
    const t2 = setTimeout(() => {
      setGone(true);
      release();
    }, TOTAL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      release();
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[200]"
    >
      {BAR_DELAYS_MS.map((delay, i) => (
        <div
          key={i}
          className="absolute bg-coral"
          style={{
            left: `${i * 20}%`,
            width: "20.5%",
            top: -20,
            height: collapsed ? "1%" : "calc(100% + 20px)",
            borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.2)" : undefined,
            transition: `height ${COLLAPSE_MS}ms cubic-bezier(1, 0, 0.56, 1) ${delay}ms`,
          }}
        />
      ))}

      {/* Brand beat while the curtain holds */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-4"
        style={{
          opacity: collapsed ? 0 : 1,
          transition: "opacity 350ms ease",
        }}
      >
        <div className="flex items-center justify-center rounded-2xl bg-ink px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hackhq-monogram.svg" alt="HQ" className="h-7 w-auto" />
        </div>
      </div>
    </div>
  );
}
