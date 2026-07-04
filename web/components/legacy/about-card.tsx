import { Reveal } from "./reveal";

/**
 * Orange card with the wide glass strip: pixel eyebrow + giant ABOUT title,
 * paragraph anchored lower — one-for-one with the template's About scene.
 */
export function AboutCard() {
  return (
    <section id="about" className="stack-section">
      <div
        className="hq-card grain flex flex-col items-center"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 0%, #ef8a3e 0%, #dd6a22 48%, var(--hq-orange-deep) 100%)",
        }}
      >
        <Reveal className="mt-[10svh] w-[min(94vw,1000px)]">
          <div className="glass flex flex-col items-center gap-12 px-8 py-12 text-center sm:py-16">
            <p className="px-label text-[13px] text-white/85">About HQ.26</p>
            <h2 className="px-display text-[clamp(72px,13vw,200px)] uppercase text-white">
              About
            </h2>
          </div>
        </Reveal>

        <Reveal delay={120} className="absolute bottom-[16svh]">
          <p className="body-copy w-[min(88vw,460px)] text-center text-white/90">
            HackHQ pulls every hackathon into a single, always-current
            headquarters — college, high-school, and open events across the
            world. No more digging through a dozen sites and stale
            spreadsheets. Updated daily, straight from an open-source repo.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
