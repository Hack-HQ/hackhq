"use client";

import { useState } from "react";
import type { Hackathon, SiteStats } from "@/lib/types-hq";
import { REPO_URL, submitIssueUrl } from "@/lib/types-hq";

/* ----- Stats strip (Magnetto metrics style) ----- */

export function StatsStrip({ stats }: { stats: SiteStats }) {
  const items = [
    { n: String(stats.total), suffix: "+", label: "Hackathons tracked" },
    { n: String(stats.open), suffix: "", label: "Open right now" },
    { n: stats.prizeDisplay.replace("+", ""), suffix: "+", label: "In prize pools" },
    { n: String(stats.cities), suffix: "", label: "Cities on the globe" },
  ];
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-12 sm:px-12 sm:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {items.map((it, i) => (
            <div
              key={it.label}
              className={`flex flex-col items-center text-center ${
                i > 0 ? "lg:border-l lg:border-white/10" : ""
              }`}
            >
              <div className="font-display text-[clamp(3rem,7vw,6rem)] font-semibold leading-none tracking-tight text-paper">
                {it.n}
                {it.suffix && (
                  <span className="text-paper/30">{it.suffix}</span>
                )}
              </div>
              <div className="kicker mt-3 text-paper/45">{it.label}</div>
            </div>
          ))}
        </div>
        <div className="kicker mt-10 border-t border-white/8 pt-6 text-center text-[9px] text-paper/30">
          Self-updating · fed by a GitHub Action + AI extraction pipeline ·
          community-driven
        </div>
      </div>
    </section>
  );
}

/* ----- Theme / host marquee ----- */

export function ThemeMarquee({ hackathons }: { hackathons: Hackathon[] }) {
  const themes = Array.from(new Set(hackathons.flatMap((h) => h.themes)));
  const hosts = Array.from(new Set(hackathons.map((h) => h.host))).slice(0, 10);
  const tiles = [...themes.map((t) => `#${t}`), ...hosts.map((h) => h.toUpperCase())];
  const doubled = [...tiles, ...tiles];

  return (
    <section className="overflow-hidden p-2 pt-0">
      <div className="marquee-mask py-6">
        <div className="marquee-track flex gap-3">
          {doubled.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="glass shrink-0 rounded-2xl px-7 py-4 font-mono text-[12px] tracking-[0.2em] text-paper/70"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Submit (Pillar 04 · Contribute) ----- */

export function SubmitSection() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section id="submit" className="p-2 pt-0">
      <div className="shell flex min-h-[70vh] items-center justify-center bg-[radial-gradient(80%_120%_at_20%_0%,#3a1c10_0%,#17130f_50%,#0c0a08_100%)] px-5 py-16 sm:px-10">
        {/* faint coral ember */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-coral/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-register/10 blur-[120px]" />

        <div className="glass w-full max-w-2xl rounded-[2.5rem] p-8 sm:p-12">
          <div className="kicker text-center text-coral">
            Pillar 04 · Contribute
          </div>
          <h2 className="display mt-3 text-center text-[clamp(1.5rem,3.4vw,2.6rem)] text-paper">
            Add a hackathon
            <br />
            in 60 seconds
          </h2>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-paper/60">
            Drop a name and a link. The pipeline extracts the rest - dates,
            prizes, location - and the globe updates itself. You get credit on
            the contributor wall.
          </p>

          <form
            className="mt-8 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              window.open(submitIssueUrl(name, url), "_blank");
            }}
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="flex-1">
                <span className="kicker mb-2 block text-[9px] text-paper/50">
                  Hackathon name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="HackMIT 2027"
                  className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                />
              </label>
              <label className="flex-1">
                <span className="kicker mb-2 block text-[9px] text-paper/50">
                  Website URL
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  type="url"
                  className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-2 rounded-full bg-paper py-4 font-mono text-[12px] font-bold tracking-[0.2em] text-ink transition hover:bg-white"
            >
              SUBMIT VIA GITHUB ↗
            </button>
          </form>

          <div className="kicker mt-6 text-center text-[9px] text-paper/35">
            Same engine, new surface - opens a prefilled GitHub issue
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----- Footer ----- */

export function Footer() {
  return (
    <footer className="p-2 pt-0">
      <div className="shell bg-ink px-6 pb-8 pt-14 sm:px-12 sm:pt-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <div className="kicker text-coral">HackHQ · Est. 2026</div>
            <p className="mt-4 text-sm leading-relaxed text-paper/55">
              A list tells you where the hackathons are. A product gets you
              into the room. Open source, community-fed, updated daily.
            </p>
            <div className="kicker mt-6 text-[9px] text-paper/35">
              Built by the Todd Mafia - Jose · Allyson · Cai · Vick · Henry
            </div>
          </div>

          <div className="flex gap-16">
            <FooterCol
              title="Site"
              links={[
                ["The globe", "#globe"],
                ["The deck", "#deck"],
                ["My HackHQ", "#tracker"],
                ["Submit", "#submit"],
              ]}
            />
            <FooterCol
              title="Open source"
              links={[
                ["GitHub repo", REPO_URL],
                ["listings.json", `${REPO_URL}/blob/main/.github/scripts/listings.json`],
                ["Contribute", `${REPO_URL}/blob/main/CONTRIBUTING.md`],
                ["Star us ★", REPO_URL],
              ]}
            />
          </div>
        </div>

        {/* Giant wordmark - official trademark */}
        <div className="mt-16 flex select-none justify-center overflow-hidden px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hackhq-wordmark.svg"
            alt="HackHQ"
            className="w-full max-w-[1400px]"
          />
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 font-mono text-[10px] tracking-[0.15em] text-paper/35 sm:flex-row">
          <span>©2026 HACKHQ · OPEN SOURCE</span>
          <span>FROM REPO → TO PRODUCT</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <div className="kicker mb-4 text-paper/40">{title}</div>
      <ul className="flex flex-col gap-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="text-sm text-paper/75 transition hover:text-coral"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
