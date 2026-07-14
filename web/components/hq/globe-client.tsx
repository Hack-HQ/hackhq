"use client";

import { useMemo, useState } from "react";
import type { Hackathon } from "@/lib/types-hq";
import { STATE_META } from "@/lib/types-hq";
import type { FormatFilter, StatusFilter } from "@/lib/filters";
import { applyFilters, isFiltering, splitByMappability } from "@/lib/filters";
import { GlobeMap } from "./globe-map";
import { GlobeSheet } from "./globe-sheet";

/**
 * The globe as a browsing surface (#18) as well as an exploring one.
 *
 * Owns the filter state and the selection, and hands the map only the listings
 * it can actually pin. Selection is deliberately local rather than the shared
 * `useSelection` store: that store drives the deck's centered modal, and the
 * whole point of the globe's sheet is that it does NOT cover the map (#17).
 */
export function GlobeClient({ hackathons }: { hackathons: Hackathon[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [selected, setSelected] = useState<Hackathon | null>(null);

  const filters = { q, status, format };
  const filtering = isFiltering(filters);

  const { onMap, offMap } = useMemo(
    () => splitByMappability(applyFilters(hackathons, { q, status, format })),
    [hackathons, q, status, format],
  );

  const clearAll = () => {
    setQ("");
    setStatus("all");
    setFormat("all");
  };

  // Drop a selection that the current filters have excluded — otherwise the
  // sheet keeps describing a hackathon the page no longer shows.
  //
  // Checked against onMap AND offMap, not just onMap: an online hackathon is
  // never on the map, and gating on onMap alone meant picking one from the
  // off-map list selected it and then immediately discarded it, so the panel
  // that exists to make virtual events reachable opened nothing at all.
  const stillShown =
    selected !== null &&
    (onMap.some((h) => h.id === selected.id) ||
      offMap.some((h) => h.id === selected.id));
  const visibleSelection = stillShown ? selected : null;

  return (
    <section id="globe" className="p-2 pt-0">
      <div className="shell bg-ink h-[min(86vh,1000px)] min-h-[560px]">
        <GlobeMap
          hackathons={onMap}
          selected={visibleSelection}
          onSelect={setSelected}
        />

        {/* Controls - float over the map, top-left, clear of the sheet */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 sm:p-6">
          <div className="glass-dark pointer-events-auto flex max-w-[min(100%,30rem)] flex-col gap-3 rounded-3xl p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, host, city, theme…"
                aria-label="Search hackathons"
                className="w-full rounded-full bg-ink-deep/60 px-4 py-2.5 font-mono text-[12px] text-paper outline-none transition placeholder:text-paper/30 focus:ring-2 focus:ring-coral"
              />
              {filtering && (
                <button
                  onClick={clearAll}
                  className="shrink-0 rounded-full px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-paper/50 transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
                >
                  CLEAR
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={status === "all"} onClick={() => setStatus("all")}>
                ALL
              </Pill>
              {(["open", "closing_soon", "opens_soon"] as const).map((s) => (
                <Pill
                  key={s}
                  active={status === s}
                  onClick={() => setStatus(status === s ? "all" : s)}
                  dot={STATE_META[s].color}
                >
                  {STATE_META[s].label}
                </Pill>
              ))}
              {(["In-Person", "Virtual"] as const).map((f) => (
                <Pill
                  key={f}
                  active={format === f}
                  onClick={() => setFormat(format === f ? "all" : f)}
                >
                  {f.toUpperCase()}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {visibleSelection && (
          <GlobeSheet hackathon={visibleSelection} onClose={() => setSelected(null)} />
        )}

        {/* Title + the listings the map can't show.
            Hidden on mobile while the sheet is open — there the sheet rises from
            the bottom and sits right on top of this, so the title bled through
            the panel behind the hackathon's own details. */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 p-6 sm:p-10 ${
            visibleSelection ? "hidden sm:block" : ""
          }`}
        >
          <div className="kicker text-coral">Pillar 01 · Explore</div>
          <h1 className="display mt-3 text-[clamp(1.8rem,4.5vw,3.6rem)] text-paper">
            The globe
          </h1>
          <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-paper/50">
            {onMap.length} on the map
            {filtering ? ` · ${hackathons.length - onMap.length - offMap.length} filtered out` : ""}
          </p>

          <OffMapPanel listings={offMap} onSelect={setSelected} />
        </div>
      </div>
    </section>
  );
}

/**
 * The listings the globe cannot pin: online events, and anything we failed to
 * geocode. Without this they'd simply be absent — which is the #18 complaint
 * ("online events have no location") and the #111 one (a listing that quietly
 * vanishes) in the same place.
 */
function OffMapPanel({
  listings,
  onSelect,
}: {
  listings: Hackathon[];
  onSelect: (h: Hackathon) => void;
}) {
  const [open, setOpen] = useState(false);
  if (listings.length === 0) return null;

  const virtual = listings.filter((h) => h.format === "Virtual").length;

  return (
    <div className="pointer-events-auto mt-4 max-w-md">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hq-offmap"
        className="glass-dark rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.15em] text-paper/80 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
      >
        🌐 {listings.length} not on the map
        {virtual > 0 ? ` · ${virtual} online` : ""} {open ? "▾" : "▸"}
      </button>

      {open && (
        <ul
          id="hq-offmap"
          className="glass-dark rail-scroll mt-2 max-h-56 overflow-y-auto rounded-3xl p-2"
        >
          {listings.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => onSelect(h)}
                className="w-full rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-inset"
              >
                <span
                  className="font-mono text-[9px] tracking-[0.2em]"
                  style={{ color: STATE_META[h.state].color }}
                >
                  ● {STATE_META[h.state].label}
                </span>
                <span className="mt-1 block text-sm leading-tight text-paper">
                  {h.title}
                </span>
                <span className="text-xs text-paper/50">
                  {h.host} · {h.format === "Virtual" ? "Online" : h.location}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral ${
        active
          ? "bg-paper text-ink"
          : "text-paper/60 hover:bg-white/10 hover:text-paper"
      }`}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: active ? "currentColor" : dot }}
        />
      )}
      {children}
    </button>
  );
}
