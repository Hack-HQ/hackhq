"use client";

import { useMemo, useState } from "react";
import type { Hackathon, HackState } from "@/lib/types-hq";
import { STATE_META, countdown } from "@/lib/types-hq";
import { useSelection, useTracker } from "./store";

type StatusFilter = "all" | HackState;
type FormatFilter = "all" | "In-Person" | "Virtual";

export function Deck({ hackathons }: { hackathons: Hackathon[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");

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
            Not everyone wants a globe. Scan every event in one dense,
            searchable list when you&apos;re on a mission.
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
          </div>
        </div>

        {/* Result count */}
        <div className="kicker mt-6 text-ink/40">
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
        </div>

        {/* List */}
        <div className="mt-6 flex flex-col divide-y-2 divide-ink/8 overflow-hidden rounded-[var(--card-radius)] border-2 border-ink/10 bg-white/60">
          {filtered.map((h) => (
            <HackRow key={h.id} h={h} />
          ))}
        </div>

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
        href={h.url}
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
