/**
 * Full-screen orange hero card: giant pixel wordmark with a soft blurred
 * echo behind it (Magnetto hero treatment), intro copy pinned at the bottom.
 */
export function HeroCard() {
  return (
    <section id="top" className="stack-section">
      <div
        className="hq-card grain flex items-center justify-center"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 18%, #f08a3e 0%, #db661f 44%, var(--hq-orange-deep) 100%)",
        }}
      >
        {/* Blurred echo layer */}
        <span
          aria-hidden
          className="px-display absolute select-none text-[clamp(88px,17vw,270px)] text-black/35 blur-[18px]"
          style={{ transform: "translateY(-8%) scale(1.04)" }}
        >
          HACKHQ
        </span>

        {/* Crisp wordmark */}
        <h1 className="px-display relative select-none text-[clamp(88px,17vw,270px)] text-white">
          HACKHQ
        </h1>

        {/* Intro copy */}
        <p className="body-copy absolute bottom-[112px] left-1/2 w-[min(88vw,440px)] -translate-x-1/2 text-center text-white/90">
          At HackHQ, we track every hackathon worth joining — in-person,
          virtual, and hybrid — so you can find your next build weekend before
          the deadline closes.
        </p>
      </div>
    </section>
  );
}
