import { Reveal } from "./reveal";

export function ContactSection() {
  return (
    <section
      id="contact"
      className="flex w-full flex-col items-center justify-center gap-6 px-6 py-[var(--space-3xl)] text-center min-[1200px]:py-[var(--space-5xl)]"
    >
      <Reveal>
        <p className="eyebrow text-white/45">Missing an event?</p>
      </Reveal>
      <Reveal delay={80}>
        <a
          href="https://github.com/Jose-Gael-Cruz-Lopez/hackhq/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link display-heading"
        >
          Submit a hackathon →
        </a>
      </Reveal>
    </section>
  );
}
