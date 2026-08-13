"use client";

import { useMemo, useState } from "react";
import type { Hackathon, HackState } from "@/lib/types-hq";
import {
  STATE_META,
  countdown,
  deadlineDisplay,
  eventDateDisplay,
} from "@/lib/types-hq";
import {
  filterDeckHackathons,
  type DeckFormatFilter,
  type DeckStatusFilter,
} from "@/lib/deck-order";
import { capture } from "@/lib/analytics";
import { safeHttpUrl } from "@/lib/url";
import { useSelection, useTracker } from "./store";
import { TrophyBadge } from "./trophy";

export function Deck({ hackathons }: { hackathons: Hackathon[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DeckStatusFilter>("all");
  const [format, setFormat] = useState<DeckFormatFilter>("all");

  const filtered = useMemo(
    () => filterDeckHackathons(hackathons, { q, status, format }),
    [hackathons, q, status, format],
  );

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
            // text-base below sm for the same reason as the globe search: under
            // 16px iOS zooms the page on focus and there is no maximum-scale to
            // stop it. sm: restores the 13px mono exactly.
            className="w-full rounded-full border-2 border-ink/15 bg-white/70 px-6 py-3.5 font-mono text-base tracking-wide text-ink outline-none transition placeholder:text-ink/40 focus:border-coral sm:text-[13px] lg:max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "ALL"],
                ["open", "OPEN"],
                ["closing_soon", "CLOSING SOON"],
                ["opens_soon", "OPENS SOON"],
              ] as [DeckStatusFilter, string][]
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
              ] as [DeckFormatFilter, string][]
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
      // 44px below sm, restoring the 36px circle from sm up where the GO pill
      // reappears. Below sm the row has only three children (dot, text, heart),
      // so the taller circle adds no horizontal pressure.
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-[15px] transition sm:h-9 sm:w-9 ${
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
  const { hasWin } = useTracker();
  const won = hasWin(h.id);
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const deadline = deadlineDisplay(h);
  const eventDates = eventDateDisplay(h);
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
      className="flex cursor-pointer items-center gap-4 px-5 py-4 transition hover:bg-ink/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-inset sm:px-7"
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
        title={meta.label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[15px] font-semibold text-ink">
            {h.title}
          </span>
          {won && <TrophyBadge hackathonTitle={h.title} compact />}
        </div>
        <div className="truncate text-[12px] text-ink/50">
          {h.host} · {h.location}
        </div>
        {/* Status as text, not colour alone. The dot beside the row carries it
            only through `title`, which never appears without a pointer - so on
            a phone the state was conveyed by hue alone (also WCAG 1.4.1). The
            columns that spell it out are hidden below lg, and `cd` is already
            computed for the deadline column, so it costs nothing to show. */}
        <div
          className="mt-0.5 truncate font-mono text-[10px] tracking-wider lg:hidden"
          style={{ color: meta.color }}
        >
          {meta.label.toUpperCase()}
          {cd ? ` · ${cd.toUpperCase()}` : ""}
        </div>
      </div>
      <div className="hidden w-28 shrink-0 font-mono text-[10px] tracking-wider text-ink/50 md:block">
        {h.format.toUpperCase()}
      </div>
      {/* Clamped, not free-flowing: sponsor prize copy runs to sentences
          ("Internship consideration; travel covered") and a free-wrapping cell
          turned one row into a four-line tower. Full text stays reachable via
          title and the details modal. */}
      <div
        className="line-clamp-2 hidden w-36 shrink-0 text-right font-display text-[13px] font-semibold leading-snug text-ink sm:block"
        title={h.prize ?? undefined}
      >
        {h.prize ?? "-"}
      </div>
      {/* The slots render even when empty. Conditional columns made every row
          lay out its own grid: a row with no event dates slid FORMAT and the
          prize into the space, so nothing lined up down the page. */}
      <div className="hidden w-40 shrink-0 lg:block">
        {eventDates && <DateColumn label="Event dates" value={eventDates} />}
      </div>
      <div className="hidden w-32 shrink-0 lg:block">
        {deadline && (
          <DateColumn
            className="text-coral"
            label="Deadline"
            value={deadline}
            detail={cd?.toUpperCase()}
          />
        )}
      </div>
      <SaveHeart h={h} />
      <a
        href={safeHttpUrl(h.url)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          capture("register_click", { id: h.id, title: h.title, source: "deck" });
        }}
        className="hidden rounded-full bg-register px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] text-white transition hover:brightness-110 sm:block"
      >
        {h.state === "opens_soon" ? "SITE" : "GO"}
      </a>
    </div>
  );
}

function DateColumn({
  className = "",
  label,
  value,
  detail,
}: {
  className?: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className={`text-right font-mono text-[10px] tracking-wider ${className}`}>
      <div className="text-[9px] text-ink/40">{label.toUpperCase()}</div>
      {/* nowrap: a date range must never break mid-range; the compact
          rangeDisplay form is sized to the slot. */}
      <div className="mt-1 whitespace-nowrap leading-tight text-ink/70">{value}</div>
      {detail && <div className="mt-1 text-[9px]">{detail}</div>}
    </div>
  );
}
