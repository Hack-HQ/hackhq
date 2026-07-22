"use client";

import { useRef } from "react";
import {
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { RESOURCE_TEASER, type ResourceTeaserId } from "@/lib/resources";
import { ResourceTileCard } from "./resource-tile-card";

/* Brand only: paper #F5EDE6 · coral #ED5B29 · ink #100F0F.
   Copy comes from RESOURCE_TEASER; only the backdrops live here. */
const FALLBACK_CLASSES: Record<ResourceTeaserId, string> = {
  "getting-started":
    "bg-[radial-gradient(ellipse_at_25%_20%,#ED5B29_0%,transparent_50%),linear-gradient(165deg,#100F0F_0%,#100F0F_100%)]",
  "finding-people":
    "bg-[radial-gradient(ellipse_at_80%_25%,rgba(245,237,230,0.22)_0%,transparent_52%),linear-gradient(200deg,#100F0F_0%,#100F0F_100%)]",
  "leveling-up":
    "bg-[radial-gradient(ellipse_at_40%_85%,rgba(237,91,41,0.55)_0%,transparent_55%),linear-gradient(180deg,#100F0F_20%,#100F0F_100%)]",
  tools:
    "bg-[radial-gradient(ellipse_at_55%_40%,rgba(245,237,230,0.14)_0%,transparent_48%),radial-gradient(ellipse_at_15%_75%,rgba(237,91,41,0.35)_0%,transparent_45%),linear-gradient(140deg,#100F0F_0%,#100F0F_100%)]",
};

/**
 * Parallax travel, as a percentage of the background plane's own height.
 *
 * It has to be a percentage. The plane overhangs its tile by `inset-[-18%]` —
 * an overhang that scales with the tile, which is itself sized in `vh`. Pixel
 * travel does not scale, so on a short viewport the plane slid further than it
 * overhung and left a bare strip along the tile's edge. The plane is 1.36x the
 * tile (18% above + 18% below), so travel under ~13.2% stays covered at every
 * viewport size; these sit under that with room to spare.
 */
const TRAVEL: Record<ResourceTeaserId, [number, number]> = {
  "getting-started": [-12, 12],
  "finding-people": [-12, 6],
  "leveling-up": [-6, 12],
  tools: [-11, 8],
};

const STILL: [number, number] = [0, 0];

/** Scroll progress → a `translateY` percentage of the plane's own height. */
function useParallaxPercent(
  progress: MotionValue<number>,
  [from, to]: [number, number],
): MotionValue<string> {
  return useTransform(progress, [0, 1], [`${from}%`, `${to}%`]);
}

export function ResourcesTeaser() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const still = reduceMotion === true;
  // One hook per tile — hooks cannot be called in a loop over the tile list.
  const range = (id: ResourceTeaserId) => (still ? STILL : TRAVEL[id]);
  const parallax: Record<ResourceTeaserId, MotionValue<string>> = {
    "getting-started": useParallaxPercent(scrollYProgress, range("getting-started")),
    "finding-people": useParallaxPercent(scrollYProgress, range("finding-people")),
    "leveling-up": useParallaxPercent(scrollYProgress, range("leveling-up")),
    tools: useParallaxPercent(scrollYProgress, range("tools")),
  };

  return (
    <section ref={sectionRef} className="p-2 pt-20">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {RESOURCE_TEASER.map((tile, index) => (
          <ResourceTileCard
            key={tile.id}
            tile={tile}
            fallbackClass={FALLBACK_CLASSES[tile.id]}
            parallaxY={parallax[tile.id]}
            reduceMotion={still}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
