"use client";

import { useEffect, useRef } from "react";
import type { Hackathon } from "@/lib/types-hq";
import { STATE_META, countdown, deadlineDisplay } from "@/lib/types-hq";
import { useTracker } from "./store";

/**
 * The detail panel for a hackathon picked on the globe (#17).
 *
 * A docked sheet, not the centered modal the deck uses: the whole point of
 * clicking a marker is that the camera flies to the city, and a centered modal
 * would cover the very map you just asked to see. It sits beside the globe on
 * desktop and rises from the bottom on mobile, leaving the pin visible.
 *
 * It is NOT a dialog: the map behind it stays live and interactive, so it takes
 * no focus trap and no aria-modal. Escape and a click on the globe both dismiss.
 */
export function GlobeSheet({
  hackathon,
  onClose,
}: {
  hackathon: Hackathon;
  onClose: () => void;
}) {
  const { isTracked, save, remove } = useTracker();
  const closeRef = useRef<HTMLButtonElement>(null);
  const tracked = isTracked(hackathon.id);
  const meta = STATE_META[hackathon.state];
  const cd = countdown(hackathon);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the sheet when it opens. Selecting a marker with the
  // keyboard would otherwise leave focus on a marker that the camera has just
  // flown away from, with the new content announced nowhere.
  useEffect(() => {
    closeRef.current?.focus();
  }, [hackathon.id]);

  return (
    <aside
      // A live region: the sheet's content is swapped, not remounted, when you
      // pick a second marker, so screen readers need telling that it changed.
      aria-live="polite"
      aria-label={`Details for ${hackathon.title}`}
      // glass-sheet, not glass-dark: at 0.55 alpha the map and the page title
      // read straight through this text.
      //
      // sm:top-20 rather than sm:top-6 — the BACK TO GLOBE button lives at
      // top-6 right-6, and the sheet was landing on top of it.
      className="glass-sheet pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex flex-col gap-4 rounded-3xl p-5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-20 sm:w-[22rem] sm:justify-center sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="font-mono text-[10px] tracking-[0.22em]"
          style={{ color: meta.color }}
        >
          ● {meta.label}
          {cd ? ` · ${cd.toUpperCase()}` : ""}
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1 -mt-1 rounded-full px-2 py-1 font-mono text-[11px] text-paper/50 transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          ✕
        </button>
      </div>

      <div>
        <h2 className="display text-[clamp(1.1rem,2.2vw,1.5rem)] leading-tight text-paper">
          {hackathon.title}
        </h2>
        <p className="mt-2 text-sm text-paper/60">
          {hackathon.host} · {hackathon.location}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-y border-white/10 py-4">
        <Fact label="Format" value={hackathon.format} />
        <Fact label="Prize" value={hackathon.prize ?? "TBA"} />
        <Fact label="Deadline" value={deadlineDisplay(hackathon) ?? "TBA"} />
        <Fact
          label="Themes"
          value={hackathon.themes.length ? hackathon.themes.join(", ") : "-"}
        />
      </dl>

      <div className="flex flex-col gap-2">
        <a
          href={hackathon.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-coral px-6 py-3.5 text-center font-mono text-[12px] font-bold tracking-[0.18em] text-paper transition hover:bg-coral-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
        >
          {hackathon.state === "opens_soon" ? "VISIT WEBSITE ↗" : "REGISTER ↗"}
        </a>
        <button
          onClick={() => (tracked ? remove(hackathon.id) : save(hackathon.id))}
          aria-pressed={tracked}
          className={`rounded-full border px-6 py-3 font-mono text-[11px] tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral ${
            tracked
              ? "border-coral bg-coral/15 text-coral"
              : "border-white/15 text-paper/70 hover:border-white/40 hover:text-paper"
          }`}
        >
          {tracked ? "♥ SAVED" : "♡ SAVE TO MY HQ"}
        </button>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.2em] text-paper/40">
        {label.toUpperCase()}
      </dt>
      <dd className="mt-1 text-sm text-paper/85">{value}</dd>
    </div>
  );
}
