"use client";

import Link from "next/link";
import { motion, type MotionValue } from "framer-motion";
import type { ResourceTeaserTile } from "@/lib/resources";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ResourceTileCard({
  tile,
  fallbackClass,
  parallaxY,
  reduceMotion,
  index,
}: {
  tile: ResourceTeaserTile;
  fallbackClass: string;
  parallaxY: MotionValue<string>;
  reduceMotion: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 56, scale: 0.94 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.35, margin: "0px 0px -8% 0px" }}
      transition={{
        duration: 0.7,
        delay: index * 0.1,
        ease: EASE,
      }}
      whileHover={reduceMotion ? undefined : { scale: 1.015 }}
      className="group relative min-h-[42vh] overflow-hidden rounded-[var(--shell-radius)] md:min-h-[48vh]"
    >
      <Link
        href={tile.href}
        className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink-deep"
        aria-label={`${tile.title} — open resources`}
      />

      {/* Background plane. It overhangs the tile by 18% on every side so the
          parallax travel below never exposes an edge — see TRAVEL in the teaser. */}
      <motion.div
        className="absolute inset-[-18%] will-change-transform"
        style={{ y: parallaxY }}
      >
        <div
          className={`absolute inset-0 origin-center transition-transform duration-700 ease-out ${
            reduceMotion ? "" : "group-hover:scale-[1.08]"
          } ${fallbackClass}`}
        >
          {/* Soft brand wash so the parallax reads on a flat gradient */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-50 mix-blend-soft-light"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, rgba(245,237,230,0.2) 0%, transparent 42%), radial-gradient(circle at 80% 70%, rgba(237,91,41,0.28) 0%, transparent 45%), radial-gradient(circle at 50% 50%, rgba(245,237,230,0.08) 0%, transparent 60%)",
            }}
          />
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-0 bg-ink/25 transition duration-500 group-hover:bg-ink/10" />

      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35, margin: "0px 0px -8% 0px" }}
          transition={{
            duration: 0.55,
            delay: 0.12 + index * 0.1,
            ease: EASE,
          }}
          className="flex min-h-[42%] w-[min(78%,18rem)] flex-col items-center justify-center rounded-[1.75rem] border border-paper/20 bg-ink/55 px-6 py-8 text-center shadow-[0_20px_60px_rgba(16,15,15,0.45)] backdrop-blur-[22px] transition duration-500 group-hover:border-coral/50 group-hover:bg-ink/70 sm:w-[min(70%,20rem)]"
        >
          <div className="kicker text-[9px] text-coral">{tile.kicker}</div>
          <h2 className="display mt-3 text-[clamp(1.1rem,2.4vw,1.55rem)] leading-[1.1] text-paper">
            {tile.title}
          </h2>
        </motion.div>
      </div>
    </motion.div>
  );
}
