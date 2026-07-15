"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  STATE_META,
  countdown,
  deadlineDisplay,
  type Hackathon,
} from "@/lib/types-hq";
import { useTracker } from "./store";

type GlobeDetailDrawerProps = {
  hackathon: Hackathon | null;
  onClose: () => void;
};

export function GlobeDetailDrawer({
  hackathon,
  onClose,
}: GlobeDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!hackathon) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => window.removeEventListener("keydown", onKey);
  }, [hackathon, onClose]);

  if (!hackathon) return null;

  const h = hackathon;
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const deadline = deadlineDisplay(h);
  const detailTitleId = `globe-detail-title-${h.id}`;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={detailTitleId}
      className="absolute inset-x-2 bottom-36 top-auto z-10 flex max-h-[calc(100%-12rem)] flex-col overflow-hidden rounded-3xl border border-white/15 bg-[rgba(23,19,15,0.92)] text-paper shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl md:inset-x-auto md:right-6 md:bottom-auto md:top-24 md:max-h-[calc(100%-7.5rem)] md:w-[min(26rem,calc(100%-2rem))] md:rounded-[1.75rem]"
      style={{ borderColor: `${meta.color}55` }}
    >
      <div className="flex shrink-0 justify-center pt-2.5 md:hidden">
        <span className="h-1.5 w-10 rounded-full bg-white/25" />
      </div>

      <div className="flex items-start justify-between gap-4 px-4 py-3 md:border-b md:border-white/10 md:px-5 md:py-4">
        <div>
          <div
            className="font-mono text-[10px] tracking-[0.22em]"
            style={{ color: meta.color }}
          >
            ● {meta.label}
            {cd ? ` · ${cd.toUpperCase()}` : ""}
          </div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-paper/45">
            {h.format.toUpperCase()}
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close hackathon details"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-paper/70 transition hover:bg-white/10 hover:text-paper focus:outline-none focus:ring-2 md:h-9 md:w-9"
          style={{ "--tw-ring-color": meta.color } as CSSProperties}
        >
          ✕
        </button>
      </div>

      <div className="rail-scroll flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
        <div className="kicker text-paper/45">{h.host}</div>
        <h2
          id={detailTitleId}
          className="mt-2 text-xl font-semibold leading-tight text-paper md:text-2xl"
        >
          {h.title}
        </h2>
        {h.tagline && (
          <p className="mt-3 hidden text-sm leading-relaxed text-paper/60 md:block">
            {h.tagline}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
          <DetailRow label="City" value={h.location} />
          <DetailRow label="Format" value={h.format} />
          <DetailRow label="Prize" value={h.prize ?? "See website"} />
          {deadline && <DetailRow label="Deadline" value={deadline} />}
        </div>

        <div className="mt-5 hidden gap-3 md:grid">
          <DetailRow label="City" value={h.location} />
          <DetailRow label="Format" value={h.format} />
          <DetailRow label="Prize" value={h.prize ?? "See website"} />
          {deadline && <DetailRow label="Deadline" value={deadline} />}
        </div>

        {h.themes.length > 0 && (
          <div className="mt-5 hidden flex-wrap gap-2 sm:flex">
            {h.themes.map((theme) => (
              <span
                key={theme}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper/65"
              >
                {theme}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 p-4 sm:p-5">
        <ActionButton hackathon={h} />
        <SaveHeart hackathon={h} />
      </div>
    </aside>
  );
}

function DetailRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 px-4 py-2 ${className}`}
    >
      <div className="font-mono text-[9px] tracking-[0.2em] text-paper/40">
        {label.toUpperCase()}
      </div>
      <div className="mt-1 text-sm font-medium text-paper/85">{value}</div>
    </div>
  );
}

function ActionButton({ hackathon }: { hackathon: Hackathon }) {
  const isRegister =
    hackathon.state === "open" || hackathon.state === "closing_soon";

  return (
    <a
      href={hackathon.url}
      target="_blank"
      rel="noreferrer"
      className={`block flex-1 rounded-full px-6 py-4 text-center font-mono text-[12px] font-bold tracking-[0.18em] transition focus:outline-none focus:ring-2 ${
        isRegister
          ? "bg-register text-paper hover:bg-register/85 focus:ring-register"
          : "border border-white/15 bg-white/12 text-paper hover:bg-white/18 focus:ring-muted"
      }`}
    >
      {isRegister ? "REGISTER" : "WEBSITE"}
    </a>
  );
}

function SaveHeart({ hackathon }: { hackathon: Hackathon }) {
  const { isTracked, save, remove } = useTracker();
  const tracked = isTracked(hackathon.id);
  return (
    <button
      type="button"
      onClick={() => (tracked ? remove(hackathon.id) : save(hackathon.id))}
      aria-label={tracked ? "Remove from tracker" : "Save to tracker"}
      title={tracked ? "Remove from My HackHQ" : "Save to My HackHQ"}
      className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 text-[18px] transition focus:outline-none focus:ring-2 focus:ring-coral ${
        tracked
          ? "border-coral bg-coral text-paper"
          : "border-white/20 text-paper/70 hover:border-coral hover:text-coral"
      }`}
    >
      {tracked ? "♥" : "♡"}
    </button>
  );
}
