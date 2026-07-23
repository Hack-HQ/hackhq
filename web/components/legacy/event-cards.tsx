import type { Opportunity } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";

// Three distinct cinematic moods, one per card (ember / emerald / gold),
// mirroring the template's restaurant / cocktail / car project scenes.
const MOODS = [
  "radial-gradient(110% 85% at 50% 32%, #7a1f0a 0%, #47100a 46%, #1c0503 100%)",
  "radial-gradient(110% 85% at 50% 30%, #14584330 0%, transparent 60%), radial-gradient(120% 100% at 50% 40%, #0f4634 0%, #072a1f 55%, #04160f 100%)",
  "radial-gradient(90% 80% at 72% 30%, #b4761f66 0%, transparent 55%), linear-gradient(120deg, #241503 0%, #0a0502 60%, #000000 100%)",
];

function eyebrow(opp: Opportunity) {
  const parts = [opp.type, opp.location].filter(Boolean);
  return parts.join(" · ");
}

/** README uses "—" as an empty-deadline placeholder — treat it as absent. */
function deadlineLabel(opp: Opportunity) {
  const raw = opp.deadlineRaw?.trim();
  if (raw && raw !== "—" && raw !== "-") return `Closes ${raw}`;
  return opp.organization;
}

/**
 * Full-screen "project" cards — one per featured hackathon. Each is a
 * gradient scene with a centered glass panel: eyebrow, pixel title, CTA.
 */
export function EventCards({ events }: { events: Opportunity[] }) {
  return (
    <>
      {events.map((opp, i) => (
        <section
          key={opp.id}
          id={i === 0 ? "events" : undefined}
          className="stack-section"
        >
          <div
            className="hq-card grain flex items-center justify-center"
            style={{ background: MOODS[i % MOODS.length] }}
          >
            <div className="glass relative flex w-[min(88vw,560px)] flex-col items-center gap-7 px-8 py-14 text-center sm:px-14 sm:py-16">
              <p className="px-label text-[13px] text-white/85">
                {eyebrow(opp)}
              </p>

              <h2 className="px-display text-[clamp(38px,5.4vw,68px)] uppercase leading-[0.95] text-white">
                {opp.title}
              </h2>

              <a
                href={safeHttpUrl(opp.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-black/25 px-7 py-3.5 text-sm text-white backdrop-blur-md transition-colors hover:bg-black/40"
              >
                Register
                <span aria-hidden>+</span>
              </a>

              <p className="px-label text-[11px] text-white/50">
                {deadlineLabel(opp)}
              </p>
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
