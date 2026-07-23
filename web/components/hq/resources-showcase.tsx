"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* The resources feature, rebuilt as a horizontal "expanding panels" accordion
   (ported from the Platform "Core Services" layout). Hovering / focusing a
   service opens it (orange, wide); the others collapse to thin rails. A fifth
   panel - The Playbook - stays open on the right and carries an animated dot
   field where a handful of coral dots glide between grid cells.
   Copy is the real resource-stage content; each card links to its section. */

type Service = {
  n: string;
  title: string;
  desc: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

const SERVICES: Service[] = [
  {
    n: "01",
    title: "Getting started",
    desc: "A hackathon is a build sprint with a demo at the end — not a coding exam. Show up curious; leave with a story.",
    label: "basics",
    href: "/resources#getting-started",
    icon: <IconFlag />,
  },
  {
    n: "02",
    title: "Finding your people",
    desc: "Solo is fine. A balanced team is often better. The goal is people who finish together — not a stacked résumé.",
    label: "crew",
    href: "/resources#finding-people",
    icon: <IconUsers />,
  },
  {
    n: "03",
    title: "Leveling up",
    desc: "After a few events, stop treating every weekend the same. Choose on purpose and reuse what works.",
    label: "season",
    href: "/resources#leveling-up",
    icon: <IconTrophy />,
  },
  {
    n: "04",
    title: "Tools & templates",
    desc: "Checklists, pitch decks, and the tooling that turns a weekend hack into a project that keeps going.",
    label: "toolkit",
    href: "/resources#tools",
    icon: <IconWrench />,
  },
];

export function ResourcesShowcase() {
  const [active, setActive] = useState(0);

  return (
    <section className="p-2 pt-20">
      {/* Desktop: expanding-panel accordion */}
      <div className="hidden gap-2 lg:flex lg:h-[clamp(480px,72vh,760px)]">
        {SERVICES.map((s, i) => (
          <ServicePanel
            key={s.n}
            s={s}
            active={i === active}
            onActivate={() => setActive(i)}
          />
        ))}
        <CorePanel accordion />
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 lg:hidden">
        {SERVICES.map((s) => (
          <MobileServiceCard key={s.n} s={s} />
        ))}
        <CorePanel />
      </div>
    </section>
  );
}

/* ---- Desktop accordion panel ---- */

function ServicePanel({
  s,
  active,
  onActivate,
}: {
  s: Service;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <Link
      href={s.href}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      aria-label={`${s.title} — open resources`}
      style={{ flexGrow: active ? 6 : 1, flexBasis: 0 }}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[var(--card-radius)] p-6 transition-[flex-grow] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/60 sm:p-7 ${
        active ? "bg-coral" : "bg-ink-soft/70 hover:bg-ink-soft"
      }`}
    >
      {/* top: arrow + number + divider */}
      <div>
        <div className="flex items-center gap-3">
          <span className={active ? "text-ink" : "text-paper/40"}>
            {active ? <IconArrowUpRight /> : <IconArrowDown />}
          </span>
          <span
            className={`font-display leading-none transition-all duration-500 ${
              active ? "text-4xl text-white/45" : "text-2xl text-paper/70"
            }`}
          >
            {s.n}
          </span>
        </div>
        <div
          className={`mt-4 h-px w-full ${active ? "bg-white/30" : "bg-white/10"}`}
        />
      </div>

      {/* body: revealed when active. min-w keeps the text from re-wrapping
          mid-animation as the panel grows. */}
      <div
        aria-hidden={!active}
        className={`min-w-[16rem] overflow-hidden transition-opacity duration-300 ${
          active
            ? "mt-6 flex flex-1 flex-col opacity-100 delay-200"
            : "h-0 flex-none opacity-0"
        }`}
      >
        <h3 className="text-xl font-semibold text-white sm:text-2xl">
          {s.title}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">
          {s.desc}
        </p>
        <div className="mt-6 flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-paper/25 to-paper/5">
          <div className="grid h-full w-full place-items-center text-white/25">
            <div className="scale-[2.2]">{s.icon}</div>
          </div>
        </div>
      </div>

      {/* bottom label */}
      <div
        className={`mt-auto flex items-center gap-3 pt-6 ${
          active ? "text-white" : "text-paper/45"
        }`}
      >
        <span className={active ? "opacity-90" : "opacity-60"}>{s.icon}</span>
        <span className="text-sm">{s.label}</span>
      </div>
    </Link>
  );
}

/* ---- Mobile stacked card ---- */

function MobileServiceCard({ s }: { s: Service }) {
  return (
    <Link
      href={s.href}
      className="flex flex-col rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/70 p-6 transition hover:border-coral/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/60"
    >
      <div className="flex items-center gap-3">
        <span className="text-coral">
          <IconArrowUpRight />
        </span>
        <span className="font-display text-2xl leading-none text-paper/60">
          {s.n}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-semibold text-paper">{s.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-paper/60">{s.desc}</p>
      <div className="mt-5 flex items-center gap-3 text-paper/45">
        {s.icon}
        <span className="text-sm">{s.label}</span>
      </div>
    </Link>
  );
}

/* ---- The Playbook panel (always open) ---- */

function CorePanel({ accordion }: { accordion?: boolean }) {
  return (
    <div
      style={accordion ? { flexGrow: 6, flexBasis: 0 } : undefined}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/70 p-6 sm:p-8"
    >
      <div className="flex items-center gap-4">
        <span className="kicker text-paper/70">The Playbook</span>
        <span className="h-px flex-1 bg-white/10" />
        <span className="kicker text-paper/40">4 / 4</span>
      </div>

      <h3 className="mt-6 max-w-[15ch] text-[clamp(1.6rem,2.4vw,2.4rem)] font-semibold leading-[1.05] text-paper">
        Everything you need, from first commit to demo day
      </h3>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper/55">
        Curated guides, communities, and tools — the shortcuts a first-timer
        usually learns the hard way. Start anywhere in the stack:
      </p>

      <div className="mt-8 flex-1">
        <DotField />
      </div>

      <div className="mt-6 flex items-center gap-3 text-paper/70">
        <IconDotGrid />
        <span className="text-sm">Learn, find, level up, ship.</span>
      </div>
    </div>
  );
}

/* ---- Animated dot field ----
   25 static gray dots (5×5). A few coral "travelers" sit on top and glide to
   fresh cells on an interval; the CSS transition on left/top makes each one
   travel across the grid rather than blink. */

const COLS = 5;
const ROWS = 5;
const TOTAL = COLS * ROWS;
const TRAVELERS = 5;

function cellPos(i: number) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {
    left: `${8 + (col / (COLS - 1)) * 84}%`,
    top: `${10 + (row / (ROWS - 1)) * 80}%`,
  };
}

function DotField() {
  const reduce = useReducedMotion();
  // Deterministic start so server and client first render match.
  const [cells, setCells] = useState<number[]>([1, 7, 12, 18, 23]);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      const pool = Array.from({ length: TOTAL }, (_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      setCells(pool.slice(0, TRAVELERS));
    }, 1100);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className="relative h-full min-h-[180px] w-full" aria-hidden>
      {Array.from({ length: TOTAL }, (_, i) => (
        <span
          key={i}
          className="absolute h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper/20"
          style={cellPos(i)}
        />
      ))}
      {cells.map((c, idx) => (
        <span
          key={idx}
          className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral shadow-[0_0_10px_2px_rgba(237,91,41,0.55)] transition-[left,top] duration-1000 ease-in-out"
          style={cellPos(c)}
        />
      ))}
    </div>
  );
}

/* ---- Icons ---- */

function IconArrowDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

function IconArrowUpRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M5 21V4M5 4h11l-2.2 3.5L16 11H5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M14.7 6.3a4 4 0 0 1-5.2 5.2L4 17v3h3l5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2-2 2.6-2.6Z" />
    </svg>
  );
}

function IconDotGrid() {
  return (
    <svg viewBox="0 0 18 18" fill="currentColor" className="h-4 w-4">
      {[3, 9, 15].map((y) =>
        [3, 9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />),
      )}
    </svg>
  );
}
