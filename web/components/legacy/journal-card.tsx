import Image from "next/image";
import Link from "next/link";
import type { GalleryPhoto, Opportunity } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { Reveal } from "./reveal";

// Fallback scenes when there aren't enough gallery photos.
const FALLBACKS = [
  "radial-gradient(110% 90% at 50% 30%, #14584d 0%, #0a2e26 55%, #051713 100%)",
  "radial-gradient(110% 90% at 50% 30%, #e0722c 0%, #a34410 55%, #571f06 100%)",
  "radial-gradient(110% 90% at 50% 30%, #4a1a5c 0%, #260b33 55%, #12051a 100%)",
];

/**
 * The template's Journal: intro, then full-width rounded media cards with a
 * title + pixel tag under each — here, the next hackathons to close.
 */
export function JournalCard({
  events,
  gallery,
}: {
  events: Opportunity[];
  gallery: GalleryPhoto[];
}) {
  if (events.length === 0) return null;

  return (
    <section id="journal" className="stack-section--flow">
      <div className="hq-card bg-hq-dark px-4 py-[14svh] sm:px-10">
        <Reveal>
          <h2 className="px-display text-center text-[clamp(56px,11vw,160px)] uppercase text-white">
            Journal
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <p className="body-copy mx-auto mt-6 w-[min(88vw,440px)] text-center">
            The next deadlines on the clock. Every entry links straight to the
            organizer&apos;s registration — no middleman, no signup wall.
          </p>
        </Reveal>

        <div className="mx-auto mt-[10svh] flex max-w-[1240px] flex-col gap-[9svh]">
          {events.map((opp, i) => {
            const photo = gallery[i];
            return (
              <Reveal key={opp.id}>
                <a
                  href={opp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <div
                    className="relative h-[62svh] w-full overflow-hidden rounded-[36px]"
                    style={
                      photo
                        ? undefined
                        : { background: FALLBACKS[i % FALLBACKS.length] }
                    }
                  >
                    {photo ? (
                      <Image
                        src={photo.src}
                        alt={photo.alt || opp.title}
                        fill
                        sizes="(max-width: 1240px) 92vw, 1240px"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="px-display absolute inset-0 grid place-items-center text-[clamp(64px,10vw,140px)] text-white/15">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col items-center gap-2 text-center">
                    <h3 className="w-[min(88vw,560px)] text-lg text-white/90">
                      {opp.title}
                      {opp.organization ? ` — ${opp.organization}` : ""}
                    </h3>
                    <p className="px-label text-[12px] text-white/55">
                      {STATUS_LABELS[opp.status]}
                      {opp.deadlineRaw && opp.deadlineRaw.trim() !== "—"
                        ? ` · ${opp.deadlineRaw}`
                        : ""}
                    </p>
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-[10svh] flex justify-center">
          <Link
            href="/hackathons"
            className="px-label flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-[13px] text-white/85 transition-colors hover:border-white/50 hover:text-white"
          >
            See every hackathon
            <span aria-hidden>+</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
