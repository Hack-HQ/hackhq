"use client";

import { useEffect, useState } from "react";

export type FormatStat = {
  label: string;
  count: number;
};

// Card faces for the fanned deck, one per format.
const FACES = [
  "radial-gradient(120% 100% at 50% 20%, #f08a3e 0%, #c85c1c 55%, #7a2f0d 100%)",
  "radial-gradient(120% 100% at 50% 25%, #17604a 0%, #0b3626 60%, #051d13 100%)",
  "linear-gradient(150deg, #2b2b2b 0%, #101010 60%, #000 100%)",
];

/**
 * The template's Services card-deck carousel, repurposed for event formats
 * (In-person / Virtual / Hybrid). Auto-advances; the numbered pill and copy
 * follow the active card.
 */
export function FormatsCard({ formats }: { formats: FormatStat[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setActive((a) => (a + 1) % formats.length),
      3500,
    );
    return () => clearInterval(t);
  }, [formats.length]);

  if (formats.length === 0) return null;

  return (
    <section className="stack-section">
      <div className="hq-card flex flex-col items-center justify-center gap-8 bg-hq-ink">
        <h2 className="px-display text-center text-[clamp(48px,9vw,120px)] uppercase text-white">
          Formats
        </h2>

        {/* Fanned deck */}
        <div className="relative h-[38svh] w-full max-w-[720px]">
          {formats.map((f, i) => {
            // Position relative to the active card: 0 = front-center.
            const offset =
              ((i - active) % formats.length + formats.length) %
              formats.length;
            const front = offset === 0;
            const x = offset === 0 ? 0 : offset === 1 ? 18 : -18;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${f.label}`}
                className="absolute left-1/2 top-1/2 flex aspect-[3/4] h-full flex-col items-center justify-center gap-2 rounded-[28px] transition-all duration-500"
                style={{
                  background: FACES[i % FACES.length],
                  transform: `translate(calc(-50% + ${x}%), -50%) scale(${front ? 1 : 0.86}) rotate(${front ? 0 : x / 4}deg)`,
                  zIndex: front ? 2 : 1,
                  opacity: front ? 1 : 0.55,
                }}
              >
                <span className="px-display text-[clamp(44px,6vw,84px)] text-white">
                  {f.count}
                </span>
                <span className="px-label text-[12px] text-white/75">
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Numbered pill */}
        <div className="flex items-center gap-3 rounded-full bg-white px-6 py-2.5 text-black">
          <span className="px-label text-[13px]">
            0{active + 1}
          </span>
          <span className="text-sm font-medium">
            {formats[active].label}
          </span>
        </div>

        <p className="body-copy w-[min(88vw,440px)] text-center">
          Build in a campus hall, from your bedroom, or both. Every event is
          tagged by format so you can filter for exactly how you like to hack.
        </p>
      </div>
    </section>
  );
}
