"use client";

import { useEffect, useRef } from "react";
import { RESOURCE_STAGES } from "@/lib/resources";

const LINK =
  "shrink-0 rounded-full px-4 py-2.5 font-mono text-[10px] tracking-[0.18em] text-paper/70 transition hover:bg-white/10 hover:text-paper sm:text-[11px]";

/**
 * The stage rail, pinned below the nav pill.
 *
 * A jumped-to section has to clear the pill *and* this rail. That clearance
 * used to be a literal `scroll-mt-36`, which is the same guess that broke the
 * mobile menu (#113): the rail is sized by px-based text, so a browser
 * minimum-font-size setting grows it past any hardcoded offset and the section
 * lands underneath. Measure the rail instead and publish the real number as
 * `--stage-scroll-offset` for the sections to offset by; they keep a 9rem
 * fallback for the server render and for JS-off.
 */
export function StageJumpNav() {
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const publish = () => {
      // Read the resolved `top` rather than the literal: it now comes from
      // --nav-pill-bottom, so it tracks the pill instead of guessing at it.
      // The rail's own box carries an 8px bottom pad, so the two together
      // already leave air.
      const stickyTop = parseFloat(getComputedStyle(rail).top) || 0;
      const height = rail.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--stage-scroll-offset",
        `${Math.round(stickyTop + height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={railRef}
      // Pins below the pill's measured bottom edge, not below a literal.
      // `top-20` was 5rem, a couple of px past where the pill ends (nav.tsx
      // derives that edge), so inflating the pill's text pinned the rail
      // *underneath* it. The 0.25rem is the breathing gap the old literal only
      // had by accident, now stated on purpose. The fallback matches nav.tsx
      // and only covers the render before it publishes.
      style={{ top: "calc(var(--nav-pill-bottom, 4.875rem) + 0.25rem)" }}
      className="sticky z-40 p-2 pt-0"
    >
      <div className="glass-dark flex gap-1 overflow-x-auto rounded-2xl p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RESOURCE_STAGES.map((stage) => (
          <a key={stage.id} href={`#${stage.id}`} className={LINK}>
            {stage.title.toUpperCase()}
          </a>
        ))}
        <a href="#tools" className={LINK}>
          TOOLS
        </a>
      </div>
    </section>
  );
}
