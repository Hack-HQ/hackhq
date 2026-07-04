import { Reveal } from "./reveal";

const SUBMIT_URL =
  "https://github.com/Jose-Gael-Cruz-Lopez/hackhq/issues/new?template=new_opportunity.yaml";

/**
 * The template's contact scene: big pixel headline, copy, and a centered
 * glass panel — here a single CTA to the prefilled GitHub issue template
 * instead of a form (HackHQ has no site-side write backend by design).
 */
export function SubmitCard() {
  return (
    <section id="submit" className="stack-section--flow">
      <div
        className="hq-card grain flex min-h-[100svh] flex-col items-center justify-center gap-8 px-4 py-[14svh]"
        style={{
          background:
            "radial-gradient(90% 70% at 70% 25%, #a8481a 0%, transparent 60%), radial-gradient(120% 100% at 30% 80%, #3d1206 0%, #170502 60%, #000 100%)",
        }}
      >
        <Reveal>
          <h2 className="px-display text-center text-[clamp(56px,11vw,160px)] uppercase text-white">
            Let&apos;s hack?
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <p className="body-copy w-[min(88vw,560px)] text-center">
            Running a hackathon? Whether it&apos;s a campus classic, a
            high-school first, or a global online sprint — get it in front of
            hackers who are looking for it.
          </p>
        </Reveal>

        <Reveal delay={140} className="w-[min(92vw,640px)]">
          <div className="glass flex flex-col items-center gap-8 px-8 py-12 sm:px-14">
            <p className="px-label text-[13px] text-white/85">Submit HQ.26</p>

            <a
              href={SUBMIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-label flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] text-black transition-transform hover:scale-[1.01]"
            >
              Submit a hackathon
              <span aria-hidden>+</span>
            </a>

            <p className="body-copy text-sm text-white/60">
              Opens a prefilled GitHub issue · reviewed daily
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
