import { Reveal } from "./reveal";

const TRACKS = [
  "In-person",
  "Virtual",
  "Hybrid",
  "College",
  "High school",
  "Open / public",
  "AI & ML",
  "Fintech",
  "Health",
  "Climate",
];

const FOR = [
  "First-time hackers",
  "Students",
  "Career-switchers",
  "Indie builders",
  "Teams",
  "Organizers",
];

export function AboutSection({
  stats,
}: {
  stats: { total: number; open: number; closingSoon: number };
}) {
  return (
    <section
      id="about"
      className="w-full px-6 pt-[var(--space-3xl)] min-[1200px]:px-12 min-[1200px]:pt-[var(--space-5xl)]"
    >
      <div className="mx-auto w-full max-w-[1800px]">
        <div className="flex flex-col gap-[var(--space-lg)] overflow-hidden min-[1200px]:flex-row min-[1200px]:gap-[var(--space-lg)]">
          {/* Left: copy + metadata */}
          <div className="flex flex-[5] flex-col gap-[var(--space-md)] pt-[var(--space-xl)] min-[1200px]:gap-[var(--space-4xl)]">
            <div className="flex flex-col gap-[var(--space-lg)]">
              <Reveal>
                <h2 className="display-heading">
                  Every hackathon,
                  <br />
                  one headquarters.
                </h2>
              </Reveal>
              <Reveal delay={80}>
                <p className="body-copy max-w-xl">
                  HackHQ pulls in-person, virtual, and hybrid hackathons into a
                  single, always-current map across college, high-school, and
                  open events alike. No more digging through a dozen sites and
                  stale spreadsheets. Spin the globe, find what&apos;s near you or
                  what&apos;s online, and apply before the deadline closes.
                </p>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="grid grid-cols-2 gap-[var(--space-lg)]">
                <div className="flex flex-col gap-3">
                  <p className="eyebrow eyebrow--bright">What we track</p>
                  <ul className="flex flex-col gap-1">
                    {TRACKS.map((t) => (
                      <li key={t} className="eyebrow text-white/45">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="eyebrow eyebrow--bright">Built for</p>
                  <ul className="flex flex-col gap-1">
                    {FOR.map((t) => (
                      <li key={t} className="eyebrow text-white/45">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="hidden flex-1 min-[1200px]:block" />

          {/* Right: editorial stat panel (stands in for the about image) */}
          <Reveal className="flex-[6]" delay={100}>
            <div
              className="relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-2xl border border-[var(--color-line-muted)] p-8 min-[1200px]:p-10"
              style={{
                backgroundColor: "#0c0b0b",
                backgroundImage:
                  "radial-gradient(120% 90% at 75% 10%, rgba(255,255,255,0.08), transparent 55%), linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.3))",
              }}
            >
              <p className="eyebrow text-white/50">Live coverage</p>

              <div className="flex flex-col gap-8">
                <Stat value={stats.total} label="Hackathons tracked" />
                <div className="grid grid-cols-2 gap-6">
                  <Stat value={stats.open} label="Open now" accent="#10b981" />
                  <Stat
                    value={stats.closingSoon}
                    label="Closing soon"
                    accent="#f97316"
                  />
                </div>
              </div>

              <p className="eyebrow text-white/35">Updated daily · Worldwide</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-5xl font-medium tabular-nums leading-none tracking-tight min-[1200px]:text-6xl"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      <span className="eyebrow text-white/45">{label}</span>
    </div>
  );
}
