"use client";

import { useEffect, useRef } from "react";
import {
  STATE_META,
  countdown,
  deadlineDisplay,
  eventDateDisplay,
} from "@/lib/types-hq";
import { lockScroll } from "@/lib/scroll-lock";
import { safeHttpUrl } from "@/lib/url";
import { useSelection, useTracker } from "./store";

export function DetailModal() {
  const { selected, setSelected } = useSelection();
  const { isTracked, save, remove } = useTracker();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    const release = lockScroll();
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      release();
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [selected, setSelected]);

  if (!selected) return null;
  const h = selected;
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const eventDates = eventDateDisplay(h);
  const tracked = isTracked(h.id);
  const titleId = `detail-modal-title-${h.id}`;
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled") && !el.hidden && el.tabIndex >= 0);
    if (focusable.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-deep/70 p-3 backdrop-blur-md sm:items-center sm:p-6"
      onClick={() => setSelected(null)}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-xl overflow-hidden rounded-[2.2rem] border border-white/12 bg-ink shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
      >
        {/* Header band */}
        <div className="flex items-center justify-between border-b border-white/10 px-7 py-5">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.18em] text-ink"
              style={{ background: meta.color }}
            >
              {meta.label}
            </span>
            <span className="font-mono text-[10px] tracking-[0.22em] text-paper/50">
              {h.format.toUpperCase()}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            onClick={() => setSelected(null)}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-paper/70 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6">
          <div className="kicker text-coral">{h.host}</div>
          <h3 id={titleId} className="display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] text-paper">
            {h.title}
          </h3>
          {h.tagline && (
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              {h.tagline}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <InfoChip>{h.location}</InfoChip>
            {eventDates && <InfoChip>{eventDates}</InfoChip>}
            {h.deadline && (
              <InfoChip>
                Deadline {deadlineDisplay(h)}
                {cd ? ` · ${cd}` : ""}
              </InfoChip>
            )}
            {h.themes.map((t) => (
              <InfoChip key={t}>{t}</InfoChip>
            ))}
          </div>

          {/* Prize row */}
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/4 px-6 py-4">
            <div>
              <div className="kicker text-[9px] text-paper/40">Prize pool</div>
              <div className="font-display text-2xl font-semibold tracking-tight text-paper">
                {h.prize ?? "See website"}
              </div>
            </div>
            {cd && (
              <div className="text-right">
                <div className="kicker text-[9px] text-paper/40">Countdown</div>
                <div
                  className="font-mono text-lg font-bold tracking-tight"
                  style={{ color: meta.color }}
                >
                  {cd.toUpperCase()}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={safeHttpUrl(h.url)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-full bg-coral px-7 py-4 text-center font-mono text-[12px] font-bold tracking-[0.18em] text-paper transition hover:bg-coral-bright"
            >
              {h.state === "opens_soon" ? "VISIT WEBSITE ↗" : "REGISTER ↗"}
            </a>
            <button
              onClick={() => (tracked ? remove(h.id) : save(h.id))}
              className={`rounded-full border px-7 py-4 font-mono text-[12px] tracking-[0.18em] transition ${
                tracked
                  ? "border-coral bg-coral/15 text-coral"
                  : "border-white/20 text-paper hover:bg-white/8"
              }`}
            >
              {tracked ? "♥ TRACKED" : "♡ SAVE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoChip({
  icon,
  children,
}: {
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/4 px-3.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper/75">
      {icon && <span>{icon}</span>}
      {children}
    </span>
  );
}
