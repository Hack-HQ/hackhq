"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Hackathon, HackState } from "@/lib/types-hq";
import { STATE_META, countdown } from "@/lib/types-hq";
import { safeHttpUrl } from "@/lib/url";
import { useSelection, useTracker } from "./store";

type StatusFilter = "all" | HackState;
type FormatFilter = "all" | "In-Person" | "Virtual";
type View = "grid" | "list";

export function Deck({ hackathons }: { hackathons: Hackathon[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [view, setView] = useState<View>("grid");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return hackathons.filter((h) => {
      if (status !== "all" && h.state !== status) return false;
      if (format !== "all" && h.format !== format) return false;
      if (!needle) return true;
      return [h.title, h.host, h.location, ...h.themes]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [hackathons, q, status, format]);

  return (
    <section id="deck" className="p-2 pt-0">
      <div className="shell bg-paper px-5 py-14 text-ink sm:px-10 sm:py-20 lg:px-16">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="kicker text-coral">Pillar 02 · Browse</div>
            <h2 className="display mt-3 text-[clamp(1.8rem,4.5vw,3.6rem)]">
              The deck
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ink/60">
            Not everyone wants a globe. Flip through every event as a bold,
            tactile card - or switch to the dense list when you&apos;re on a
            mission.
          </p>
        </div>

        {/* Controls */}
        <div className="mt-10 flex flex-col gap-4 border-t-2 border-ink/10 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, host, city, theme…"
            className="w-full rounded-full border-2 border-ink/15 bg-white/70 px-6 py-3.5 font-mono text-[13px] tracking-wide text-ink outline-none transition placeholder:text-ink/40 focus:border-coral lg:max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "ALL"],
                ["open", "OPEN"],
                ["closing_soon", "CLOSING SOON"],
                ["opens_soon", "OPENS SOON"],
              ] as [StatusFilter, string][]
            ).map(([id, label]) => (
              <FilterPill
                key={id}
                active={status === id}
                onClick={() => setStatus(id)}
                dotColor={id !== "all" ? STATE_META[id as HackState].color : undefined}
              >
                {label}
              </FilterPill>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-ink/15 sm:block" />
            {(
              [
                ["all", "ANY FORMAT"],
                ["In-Person", "IN-PERSON"],
                ["Virtual", "VIRTUAL"],
              ] as [FormatFilter, string][]
            ).map(([id, label]) => (
              <FilterPill
                key={id}
                active={format === id}
                onClick={() => setFormat(id)}
              >
                {label}
              </FilterPill>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-ink/15 sm:block" />
            <div className="flex overflow-hidden rounded-full border-2 border-ink/15">
              {(["grid", "list"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 font-mono text-[10px] tracking-[0.2em] transition ${
                    view === v ? "bg-ink text-paper" : "text-ink/60 hover:bg-ink/5"
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result count */}
        <div className="kicker mt-6 text-ink/40">
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
        </div>

        {/* Cards */}
        {view === "grid" ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((h) => (
              <HackCard key={h.id} h={h} />
            ))}
          </div>
        ) : (
          <div className="mt-6 flex flex-col divide-y-2 divide-ink/8 overflow-hidden rounded-[var(--card-radius)] border-2 border-ink/10 bg-white/60">
            {filtered.map((h) => (
              <HackRow key={h.id} h={h} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-10 rounded-[var(--card-radius)] border-2 border-dashed border-ink/15 p-16 text-center">
            <div className="display text-3xl text-ink/30">Nothing here</div>
            <p className="mt-2 text-sm text-ink/50">
              Try clearing a filter - or add the hackathon you&apos;re looking
              for.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 font-mono text-[10px] tracking-[0.18em] transition ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-ink/15 text-ink/60 hover:border-ink/40"
      }`}
    >
      {dotColor && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      )}
      {children}
    </button>
  );
}

function SaveHeart({ h, dark }: { h: Hackathon; dark?: boolean }) {
  const { isTracked, save, remove } = useTracker();
  const tracked = isTracked(h.id);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (tracked) remove(h.id);
        else save(h.id);
      }}
      aria-label={tracked ? "Remove from tracker" : "Save to tracker"}
      title={tracked ? "Remove from My HackHQ" : "Save to My HackHQ"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[15px] transition ${
        tracked
          ? "border-coral bg-coral text-paper"
          : dark
            ? "border-white/20 text-paper/70 hover:border-coral hover:text-coral"
            : "border-ink/15 text-ink/50 hover:border-coral hover:text-coral"
      }`}
    >
      {tracked ? "♥" : "♡"}
    </button>
  );
}

function Paperclip() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/* Exact motion values lifted from the Framer "Document Folder" module
   (framer.com/m/Document-card-U9IiCH.js): #141414 folder, white paper
   that lifts with a +6° tilt under a 5-layer shadow, spring bounce .2. */
const PAPER_LIFT_SHADOW =
  "0px -0.77px 0.46px -0.75px rgba(0,0,0,0.18), 0px -2.1px 1.26px -1.5px rgba(0,0,0,0.18), 0px -4.61px 2.76px -2.25px rgba(0,0,0,0.17), 0px -10.23px 6.14px -3px rgba(0,0,0,0.14), 0px -26px 15.6px -3.75px rgba(0,0,0,0.06)";
const SPRING = { type: "spring", bounce: 0.2, duration: 1 } as const;
const SPRING_SLOW = { type: "spring", bounce: 0.2, duration: 1.5 } as const;

/**
 * Hackathon as a classified dossier - faithful port of the Framer
 * "Document Folder" card, driven by real hackathon data: the paper
 * lifts and tilts out of the folder on hover while the flap swings open.
 */
function HackCard({ h }: { h: Hackathon }) {
  const { setSelected } = useSelection();
  const reduceMotion = useReducedMotion();
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const dim = h.state === "closed";
  const openDetails = () => setSelected(h);
  const onOpenKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      openDetails();
    }
  };

  return (
    <motion.article
      onClick={openDetails}
      onKeyDown={onOpenKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${h.title}`}
      initial="rest"
      animate="rest"
      whileHover={reduceMotion ? undefined : "open"}
      className={`group relative aspect-[318/380] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${dim ? "opacity-55 saturate-50" : ""}`}
      style={{ perspective: 1400 }}
    >
      {/* Folder back */}
      <div className="absolute inset-x-0 top-6 bottom-0 rounded-[21.6px] bg-[#141414]">
        {/* folder tab */}
        <div className="absolute -top-3.5 left-0 h-5 w-24 rounded-t-lg bg-[#141414]" />
      </div>

      {/* Paper - lifts + tilts out on hover */}
      <motion.div
        variants={{
          rest: { y: 0, rotate: 0, boxShadow: "0px 0px 0px 0px rgba(0,0,0,0)" },
          open: { y: -44, rotate: 6, boxShadow: PAPER_LIFT_SHADOW },
        }}
        transition={SPRING}
        className="absolute inset-x-4 top-2 bottom-32 rounded-lg bg-white px-4 pt-3.5"
      >
        <div className="kicker text-[8px] text-ink/40">
          HackHQ dossier · {h.format}
        </div>
        <div className="mt-2 font-display text-lg font-semibold leading-tight tracking-tight text-ink">
          {h.prize ?? "Prizes on site"}
        </div>
        <div className="mt-1.5 flex flex-col gap-1 font-mono text-[10px] leading-relaxed text-ink/60">
          <span>{h.location}</span>
          {cd && <span className="text-coral">{cd.toUpperCase()}</span>}
          {h.themes.length > 0 && <span>{h.themes.map((t) => `#${t}`).join(" ")}</span>}
        </div>
        {/* Rotated status stamp */}
        <div
          className="absolute bottom-3 right-3 flex h-16 w-16 -rotate-12 items-center justify-center rounded-full border-[2.5px] text-center font-mono text-[8px] font-bold leading-tight tracking-[0.1em]"
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {meta.label.split(" ").map((w) => (
            <span key={w} className="block w-full">
              {w}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Folder front flap - swings open (3D, hinged on the left) */}
      <motion.div
        variants={{ rest: { rotateY: 0 }, open: { rotateY: -15 } }}
        transition={SPRING_SLOW}
        style={{ transformOrigin: "left center", transformStyle: "preserve-3d" }}
        className="absolute inset-x-0 bottom-0 top-[30%] rounded-[21.6px] bg-[#141414] shadow-[inset_0_3px_2px_rgba(255,255,255,0.2)]">
        {/* Paperclip */}
        <div className="absolute -top-2.5 left-5 rotate-[8deg] text-paper/35">
          <Paperclip />
        </div>

        {/* Status pill */}
        <span
          className="absolute right-4 top-4 rounded-full px-3 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-ink"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>

        {/* Vertical edge label */}
        <span
          className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 font-mono text-[8px] tracking-[0.3em] text-paper/25 sm:block"
          style={{ writingMode: "vertical-rl" }}
        >
          HQ-{h.id.slice(0, 4).toUpperCase()}
        </span>

        {/* Label block (bottom-left, like the original folder) */}
        <div className="absolute bottom-4 left-5 right-12 flex flex-col gap-1.5">
          <div className="kicker text-[9px] text-paper/45">{h.host}</div>
          <h3 className="display line-clamp-2 text-[1.25rem] leading-[1.05] text-paper transition-colors group-hover:text-coral-bright">
            {h.title}
          </h3>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[9px] tracking-[0.12em] text-paper/40">
              {h.location.toUpperCase()}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <SaveHeart h={h} dark />
              <a
                href={safeHttpUrl(h.url)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`rounded-full px-4 py-2 font-mono text-[9px] font-bold tracking-[0.14em] text-white transition ${
                  h.state === "opens_soon"
                    ? "bg-white/15 hover:bg-white/25"
                    : "bg-register hover:brightness-110"
                }`}
              >
                {h.state === "opens_soon" ? "SITE" : "REGISTER"}
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.article>
  );
}

function HackRow({ h }: { h: Hackathon }) {
  const { setSelected } = useSelection();
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const openDetails = () => setSelected(h);
  const onOpenKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      openDetails();
    }
  };

  return (
    <div
      onClick={openDetails}
      onKeyDown={onOpenKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${h.title}`}
      className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition hover:bg-ink/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-inset sm:px-7 ${h.state === "closed" ? "opacity-50" : ""}`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
        title={meta.label}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-semibold text-ink">
          {h.title}
        </div>
        <div className="truncate text-[12px] text-ink/50">
          {h.host} · {h.location}
        </div>
      </div>
      <div className="hidden w-28 font-mono text-[10px] tracking-wider text-ink/50 md:block">
        {h.format.toUpperCase()}
      </div>
      <div className="hidden w-32 text-right font-display text-sm font-semibold text-ink sm:block">
        {h.prize ?? "-"}
      </div>
      <div className="hidden w-28 text-right font-mono text-[10px] tracking-wider text-coral lg:block">
        {cd?.toUpperCase() ?? ""}
      </div>
      <SaveHeart h={h} />
      <a
        href={safeHttpUrl(h.url)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="hidden rounded-full bg-register px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] text-white transition hover:brightness-110 sm:block"
      >
        {h.state === "opens_soon" ? "SITE" : "GO"}
      </a>
    </div>
  );
}
