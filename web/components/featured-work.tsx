import Link from "next/link";
import type { Opportunity } from "@/lib/types";
import { ProjectTile } from "./project-tile";
import { Reveal } from "./reveal";

// Narrow/wide rhythm for the 6-column asymmetric grid (from handoff spec).
const SIZES: Array<"small" | "large"> = [
  "small",
  "large",
  "large",
  "small",
  "small",
  "large",
];

export function FeaturedWork({
  opportunities,
}: {
  opportunities: Opportunity[];
}) {
  // Prefer live events, closing-soon first, then take six.
  const order = { CLOSING_SOON: 0, OPEN: 1, OPENS_SOON: 2, CLOSED: 3 };
  const featured = [...opportunities]
    .filter((o) => o.status !== "CLOSED")
    .sort((a, b) => order[a.status] - order[b.status])
    .slice(0, 6);

  if (featured.length === 0) return null;

  return (
    <section
      id="works"
      className="w-full px-6 pt-[var(--space-2xl)] min-[1200px]:px-12"
    >
      <div className="mx-auto w-full max-w-[1800px]">
        <div className="grid grid-cols-12 pb-[var(--space-lg)] pt-[var(--space-xl)]">
          <Reveal className="col-span-12 min-[810px]:col-span-6">
            <h2 className="display-heading">Selected hackathons</h2>
          </Reveal>
        </div>

        <div className="projects-grid">
          {featured.map((opp, i) => (
            <Reveal
              key={opp.id}
              className={SIZES[i] === "large" ? "tile-lg" : "tile-sm"}
              delay={i * 60}
            >
              <ProjectTile opp={opp} size={SIZES[i]} index={i} />
            </Reveal>
          ))}
        </div>

        <div className="mt-[var(--space-2xl)] flex justify-center">
          <Link
            href="/hackathons"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-line-muted)] px-6 py-3 text-xs font-medium uppercase tracking-wide text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            See them all
            <span className="transition-transform duration-300 group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
