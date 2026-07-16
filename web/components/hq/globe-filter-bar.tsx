"use client";

import { STATE_META, type HackState, type Hackathon } from "@/lib/types-hq";

type Format = Hackathon["format"];

const STATUS_PILLS: HackState[] = ["open", "opens_soon", "closing_soon"];
// Only these two narrow the map pins. "Virtual" isn't a pin filter (virtual
// events have no coordinates) - it opens the online-events drawer instead.
const FORMAT_PILLS: Format[] = ["In-Person", "Hybrid"];

type GlobeFilterBarProps = {
  query: string;
  onQueryChange: (q: string) => void;
  activeStatuses: Set<HackState>;
  onToggleStatus: (s: HackState) => void;
  activeFormats: Set<Format>;
  onToggleFormat: (f: Format) => void;
  // Online events matching the current search/status filters. Shown on the
  // VIRTUAL pill so a zero count is visible before the drawer is opened.
  virtualCount: number;
  virtualButtonRef?: React.Ref<HTMLButtonElement>;
  onOpenVirtual: () => void;
  onClearAll: () => void;
};

export function GlobeFilterBar({
  query,
  onQueryChange,
  activeStatuses,
  onToggleStatus,
  activeFormats,
  onToggleFormat,
  virtualCount,
  virtualButtonRef,
  onOpenVirtual,
  onClearAll,
}: GlobeFilterBarProps) {

  const anyActive =
    query.trim().length > 0 || activeStatuses.size > 0 || activeFormats.size > 0;

  const rowClass =
    "flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col gap-1.5 sm:left-4 sm:top-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search hackathon, location…"
          aria-label="Search hackathons"
          className="glass-dark w-56 rounded-full border border-white/15 px-4 py-2 text-sm text-paper placeholder:text-paper/40 focus:outline-none focus:ring-2 focus:ring-coral sm:w-72"
        />
        {anyActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper/70 underline-offset-2 transition hover:text-paper hover:underline focus:outline-none focus:ring-2 focus:ring-coral"
          >
            CLEAR
          </button>
        )}
      </div>

      {/* Row 1 - status */}
      <div className={rowClass}>
        {STATUS_PILLS.map((s) => (
          <FilterPill
            key={s}
            active={activeStatuses.has(s)}
            onClick={() => onToggleStatus(s)}
            dotColor={STATE_META[s].color}
          >
            {STATE_META[s].label}
          </FilterPill>
        ))}
      </div>

      {/* Row 2 - format (In-Person / Hybrid) + the Virtual drawer opener */}
      <div className={rowClass}>
        {FORMAT_PILLS.map((f) => (
          <FilterPill
            key={f}
            active={activeFormats.has(f)}
            onClick={() => onToggleFormat(f)}
          >
            {f.toUpperCase()}
          </FilterPill>
        ))}

        {/* Virtual isn't a pin filter - it opens the online-events drawer. */}
        <button
          ref={virtualButtonRef}
          type="button"
          onClick={onOpenVirtual}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-coral/40 bg-coral/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper/80 transition hover:bg-coral/20 hover:text-paper focus:outline-none focus:ring-2 focus:ring-coral"
        >
          🌐 VIRTUAL ({virtualCount})
        </button>
      </div>
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
  dotColor,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-coral ${
        active
          ? "bg-paper text-ink"
          : "glass-dark border border-white/15 text-paper/70 hover:text-paper"
      }`}
    >
      {dotColor && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
