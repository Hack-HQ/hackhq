import Link from "next/link";
import {
  RESOURCE_STAGES,
  RESOURCE_TOOLS,
  stageKicker,
  type ResourceLink,
  type ResourceStage,
} from "@/lib/resources";
import { StageJumpNav } from "./stage-jump-nav";

/**
 * Sections offset their jump landing by the pinned rail's measured height.
 * The 9rem fallback is what the rail actually measures at default text size,
 * so the server render and a JS-off visit behave the same as a live one.
 */
const CLEARS_RAIL = { scrollMarginTop: "var(--stage-scroll-offset, 9rem)" };

export function Resources() {
  return (
    <>
      <Hero />
      {/* The rail pins within this wrapper, not the whole page: it is only
          useful while a section it links to is still in play, so it releases
          after the toolkit rather than hovering over the closing CTA. */}
      <div>
        <StageJumpNav />
        {RESOURCE_STAGES.map((stage, i) => (
          <StageSection key={stage.id} stage={stage} index={i} />
        ))}
        <ToolsStrip />
      </div>
      <NextStepCta />
    </>
  );
}

function Hero() {
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink px-6 py-16 sm:px-12 sm:py-24">
        <div className="kicker text-coral">Resources · Field guide</div>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2rem,6vw,4.2rem)] text-paper">
          From first commit
          <br />
          to final pitch
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-paper/60 sm:text-base">
          Practical tips and curated links for every stage—first timer, team
          finder, weekend survivor, and power user.
        </p>
      </div>
    </section>
  );
}

function StageSection({
  stage,
  index,
}: {
  stage: ResourceStage;
  index: number;
}) {
  const soft = index % 2 === 0;
  return (
    <section id={stage.id} style={CLEARS_RAIL} className="p-2 pt-0">
      <div
        className={`shell px-6 py-14 sm:px-12 sm:py-20 ${
          soft ? "bg-ink-soft" : "bg-ink"
        }`}
      >
        <div className="kicker text-coral">{stageKicker(stage, index)}</div>
        <h2 className="display mt-3 text-[clamp(1.5rem,3.5vw,2.6rem)] text-paper">
          {stage.title}
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-paper/60">
          {stage.summary}
        </p>

        <ul className="mt-10 max-w-2xl space-y-4">
          {stage.tips.map((tip) => (
            <li
              key={tip}
              className="flex gap-3 text-sm leading-relaxed text-paper/80"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        <div className="mt-12">
          <div className="kicker mb-4 text-paper/40">Go deeper</div>
          <ul className="divide-y divide-white/8 border-y border-white/8">
            {stage.links.map((link) => (
              <LinkRow key={link.href} link={link} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function LinkRow({ link }: { link: ResourceLink }) {
  return (
    <li>
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="group flex items-start justify-between gap-6 py-4 transition hover:bg-white/[0.03]"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-paper transition group-hover:text-coral">
            {link.title}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-paper/50">
            {link.blurb}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] tracking-[0.15em] text-paper/35 transition group-hover:text-coral">
          ↗
        </span>
      </a>
    </li>
  );
}

function ToolsStrip() {
  return (
    <section id="tools" style={CLEARS_RAIL} className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-14 sm:px-12 sm:py-20">
        <div className="kicker text-coral">Toolkit · Always useful</div>
        <h2 className="display mt-3 text-[clamp(1.5rem,3.5vw,2.6rem)] text-paper">
          Tools & templates
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/60">
          Steal these for any weekend—first hackathon or fiftieth.
        </p>

        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {RESOURCE_TOOLS.map((tool) => (
            <div key={tool.title}>
              <div className="font-mono text-[12px] tracking-[0.18em] text-paper">
                {tool.title.toUpperCase()}
              </div>
              <p className="mt-2 text-sm text-paper/50">{tool.blurb}</p>
              <ul className="mt-5 space-y-2.5">
                {tool.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-paper/75"
                  >
                    <span className="text-coral">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NextStepCta() {
  return (
    <section className="p-2 pt-0">
      <div className="shell flex min-h-[40vh] flex-col items-center justify-center bg-ink px-6 py-16 text-center sm:px-12">
        <div className="kicker text-coral">Next · Find an event</div>
        <h2 className="display mt-3 text-[clamp(1.4rem,3vw,2.2rem)] text-paper">
          Ready to pick one?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-paper/60">
          Browse the globe or flip the deck—then show up with a plan.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/globe"
            className="rounded-full bg-paper px-7 py-4 font-mono text-[12px] font-bold tracking-[0.2em] text-ink transition hover:bg-white"
          >
            OPEN GLOBE →
          </Link>
          <Link
            href="/deck"
            className="rounded-full border border-white/20 px-7 py-4 font-mono text-[12px] font-bold tracking-[0.2em] text-paper transition hover:border-coral hover:text-coral"
          >
            OPEN DECK →
          </Link>
        </div>
      </div>
    </section>
  );
}
