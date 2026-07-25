"use client";

/* ---------------------------------------------------------------------------
   Trophy badges for hackathon wins (#226).

   One icon and one badge, shared by every surface that can show a win — deck
   row, detail dialog, tracker card — so the gold, the size and the wording stay
   in step. The colour is the `trophy` design token, which is the passport
   cover's foil gold.

   Accessibility: the badge is decorative markup carrying real meaning, so it
   ships both an `aria-label` (with `role="img"`, since the visual is an icon
   rather than text) and a `title`, which is what produces the hover tooltip the
   issue asks for. The SVG itself stays `aria-hidden` so a screen reader hears
   the label once, not twice.
--------------------------------------------------------------------------- */

export function TrophyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  );
}

/**
 * The win marker. `label` names the hackathon when there is one to name, so a
 * screen reader reaching a list of cards hears which event was won rather than
 * "won" four times over.
 */
export function TrophyBadge({
  hackathonTitle,
  compact = false,
}: {
  hackathonTitle?: string;
  compact?: boolean;
}) {
  const label = hackathonTitle ? `Won ${hackathonTitle}` : "Won this hackathon";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-trophy/40 bg-trophy/15 font-mono font-bold tracking-[0.16em] text-trophy ${
        compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
      }`}
    >
      <TrophyIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {!compact && "WON"}
    </span>
  );
}

/**
 * The control that records a win. Lives on tracker cards in the Going column:
 * a win is only meaningful for an event you attended, and the store moves a
 * hackathon there when one is claimed.
 */
export function WinToggle({
  won,
  hackathonTitle,
  onToggle,
}: {
  won: boolean;
  hackathonTitle: string;
  onToggle: () => void;
}) {
  const label = won
    ? `Clear the win for ${hackathonTitle}`
    : `Mark ${hackathonTitle} as won`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={won}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[9px] tracking-[0.14em] transition ${
        won
          ? "border-trophy/60 bg-trophy/18 text-trophy hover:bg-trophy/28"
          : "border-white/20 text-paper/60 hover:border-trophy/50 hover:text-trophy"
      }`}
    >
      <TrophyIcon className="h-3 w-3" />
      {won ? "WON" : "I WON"}
    </button>
  );
}
