"use client";

import { useRef } from "react";
import { STATE_META, countdown, type Hackathon } from "@/lib/types-hq";
import { useDialogDismiss } from "./use-dialog-dismiss";

type GlobeVirtualDrawerProps = {
  open: boolean;
  hackathons: Hackathon[];
  onClose: () => void;
  onSelect: (h: Hackathon) => void;
};

export function GlobeVirtualDrawer({
  open,
  hackathons,
  onClose,
  onSelect,
}: GlobeVirtualDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes, focus lands on the close button, and on close it returns to
  // the trigger (the 🌐 VIRTUAL button) that opened the drawer (WCAG 2.4.3).
  useDialogDismiss(open, onClose, {
    initialFocusRef: closeButtonRef,
    restoreFocus: true,
  });

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Online events"
      className="absolute inset-x-2 bottom-36 top-[20%] z-10 flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-[rgba(23,19,15,0.92)] text-paper shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl md:inset-x-auto md:right-6 md:bottom-auto md:top-24 md:max-h-[calc(100%-7.5rem)] md:w-[min(26rem,calc(100%-2rem))] md:rounded-[1.75rem]"
    >
      <div className="flex shrink-0 justify-center pt-2.5 md:hidden">
        <span className="h-1.5 w-10 rounded-full bg-white/25" />
      </div>

      <div className="flex items-start justify-between gap-4 px-4 py-3 md:border-b md:border-white/10 md:px-5 md:py-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-coral">
            🌐 ONLINE EVENTS
          </div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-paper/45">
            {hackathons.length} {hackathons.length === 1 ? "EVENT" : "EVENTS"} · NO
            MAP PIN
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close online events"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-paper/70 transition hover:bg-white/10 hover:text-paper focus:outline-none focus:ring-2 focus:ring-coral md:h-9 md:w-9"
        >
          ✕
        </button>
      </div>

      <div className="rail-scroll flex-1 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
        {hackathons.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-paper/50">
            No online events match your filters.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hackathons.map((h) => {
              const meta = STATE_META[h.state];
              const cd = countdown(h);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(h)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-coral"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-paper">
                        {h.title}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.14em] text-paper/50">
                        {h.host}
                        {cd ? ` · ${cd.toUpperCase()}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
