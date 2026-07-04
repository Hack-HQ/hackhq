import { CountUp } from "./count-up";
import { Reveal } from "./reveal";

/**
 * Dark card with the template's giant animated counters, fed by live stats:
 * hackathons tracked / open now / closing soon.
 */
export function MilestonesCard({
  stats,
}: {
  stats: { total: number; open: number; closingSoon: number };
}) {
  const rows = [
    { value: stats.total, label: "Hackathons tracked" },
    { value: stats.open, label: "Open right now" },
    { value: stats.closingSoon, label: "Closing soon" },
  ];

  return (
    <section className="stack-section">
      <div className="hq-card flex flex-col items-center justify-center bg-hq-dark">
        <h2 className="px-display mb-[6svh] text-center text-[clamp(44px,8vw,110px)] uppercase text-white">
          Milestones
        </h2>

        <div className="flex w-[min(88vw,520px)] flex-col items-center">
          {rows.map((row, i) => (
            <Reveal key={row.label} delay={i * 100} className="w-full">
              <div
                className={`flex flex-col items-center gap-1 py-[3.5svh] ${
                  i > 0 ? "border-t border-[var(--hq-line)]" : ""
                }`}
              >
                <p className="px-display text-[clamp(56px,9svh,110px)] text-white">
                  <CountUp end={row.value} />
                  <span aria-hidden className="text-white/30">
                    +
                  </span>
                </p>
                <p className="body-copy">{row.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
