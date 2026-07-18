"use client";

import { useRef } from "react";
import {
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  ResourceTileCard,
  type ResourceTile,
} from "./resource-tile-card";

/* Brand only: paper #F5EDE6 · coral #ED5B29 · ink #100F0F */
const RESOURCE_TILES: [
  ResourceTile,
  ResourceTile,
  ResourceTile,
  ResourceTile,
] = [
  {
    id: "getting-started",
    kicker: "Stage 01",
    title: "Getting started",
    href: "/resources#getting-started",
    fallbackClass:
      "bg-[radial-gradient(ellipse_at_25%_20%,#ED5B29_0%,transparent_50%),linear-gradient(165deg,#100F0F_0%,#100F0F_100%)]",
  },
  {
    id: "finding-people",
    kicker: "Stage 02",
    title: "Finding your people",
    href: "/resources#finding-people",
    fallbackClass:
      "bg-[radial-gradient(ellipse_at_80%_25%,rgba(245,237,230,0.22)_0%,transparent_52%),linear-gradient(200deg,#100F0F_0%,#100F0F_100%)]",
  },
  {
    id: "leveling-up",
    kicker: "Stage 03",
    title: "Leveling up",
    href: "/resources#leveling-up",
    fallbackClass:
      "bg-[radial-gradient(ellipse_at_40%_85%,rgba(237,91,41,0.55)_0%,transparent_55%),linear-gradient(180deg,#100F0F_20%,#100F0F_100%)]",
  },
  {
    id: "tools",
    kicker: "Stage 04",
    title: "Tools and templates",
    href: "/resources#tools",
    fallbackClass:
      "bg-[radial-gradient(ellipse_at_55%_40%,rgba(245,237,230,0.14)_0%,transparent_48%),radial-gradient(ellipse_at_15%_75%,rgba(237,91,41,0.35)_0%,transparent_45%),linear-gradient(140deg,#100F0F_0%,#100F0F_100%)]",
  },
];

export function ResourcesTeaser() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Pixel parallax — % values barely move and look static on flat gradients
  const still = reduceMotion === true;
  const yA = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [-70, 70]);
  const yB = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [-90, 50]);
  const yC = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [-50, 90]);
  const yD = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [-80, 60]);

  const tiles: [ResourceTile, MotionValue<number>, number][] = [
    [RESOURCE_TILES[0], yA, 0],
    [RESOURCE_TILES[1], yB, 1],
    [RESOURCE_TILES[2], yC, 2],
    [RESOURCE_TILES[3], yD, 3],
  ];

  return (
    <section ref={sectionRef} className="p-2 pt-20">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {tiles.map(([tile, parallaxY, index]) => (
          <ResourceTileCard
            key={tile.id}
            tile={tile}
            parallaxY={parallaxY}
            reduceMotion={still}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
