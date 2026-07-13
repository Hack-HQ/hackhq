"use client";

import { useMemo, useState } from "react";
import type { Hackathon } from "@/lib/types-hq";
import { STATE_META, countdown } from "@/lib/types-hq";
import { countKnownTracked } from "@/lib/tracker-utils";
import { STAGES, useSelection, useTracker, type Stage } from "./store";

export function Tracker({ hackathons }: { hackathons: Hackathon[] }) {
  const { tracked, move, remove } = useTracker();
  const { setSelected } = useSelection();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const byId = useMemo(
    () => Object.fromEntries(hackathons.map((h) => [h.id, h])),
    [hackathons],
  );

  const columns = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        items: Object.entries(tracked)
          .filter(([, stage]) => stage === s.id)
          .map(([id]) => byId[id])
          .filter((h): h is Hackathon => Boolean(h))
          .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)),
      })),
    [tracked, byId],
  );

  const trackedCount = useMemo(
    () => countKnownTracked(tracked, hackathons.map((h) => h.id)),
    [tracked, hackathons],
  );

  // Deadline radar: the most urgent live deadline you're tracking.
  const urgent = useMemo(() => {
    const live = Object.keys(tracked)
      .map((id) => byId[id])
      .filter((h): h is Hackathon => Boolean(h))
      .filter((h) => h.daysLeft !== null && h.daysLeft >= 0);
    return live.sort((a, b) => a.daysLeft! - b.daysLeft!)[0] ?? null;
  }, [tracked, byId]);

  return (
    <section id="tracker" className="p-2 pt-0">
      <div className="shell bg-ink px-5 py-14 sm:px-10 sm:py-20 lg:px-16">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="kicker text-coral">Pillar 03 · Track</div>
            <h2 className="display mt-3 text-[clamp(1.8rem,4.5vw,3.6rem)] text-paper">
              My HackHQ
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-paper/55">
            Run your hackathon hunt like a pipeline. Tap ♡ on any card in the
            deck or globe to save it here, then drag it from Interested to
            Going.
          </p>
        </div>

        {/* Pipeline */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.id);
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => {
                if (dragId) move(dragId, col.id);
                setDragId(null);
                setOverStage(null);
              }}
              className={`flex min-h-56 flex-col rounded-3xl border p-4 transition ${
                overStage === col.id
                  ? "border-coral/70 bg-coral/8"
                  : "border-white/10 bg-white/3"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="kicker flex items-center gap-2 text-paper/70">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: col.color }}
                  />
                  <span id={`tracker-stage-${col.id}`}>{col.label}</span>
                </span>
                <span className="font-mono text-[10px] text-paper/35">
                  {col.items.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5">
                {col.items.map((h) => (
                  <TrackerCard
                    key={h.id}
                    h={h}
                    dragging={dragId === h.id}
                    stageId={col.id}
                    onDragStart={() => setDragId(h.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    onOpen={() => setSelected(h)}
                    onRemove={() => remove(h.id)}
                    onMoveStage={(stage) => move(h.id, stage)}
                  />
                ))}
                {col.items.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center font-mono text-[10px] tracking-[0.15em] text-paper/25">
                    {col.id === "interested" && trackedCount === 0
                      ? "TAP ♡ ON A CARD TO START"
                      : "DROP HERE"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Deadline radar */}
        <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-coral/25 bg-gradient-to-r from-coral/12 to-transparent px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-coral" />
            </span>
            <div>
              <div className="kicker text-[9px] text-coral">Deadline radar</div>
              <div className="mt-1 text-sm font-semibold text-paper">
                {urgent
                  ? `${urgent.title} ${countdown(urgent) ?? ""}`.trim()
                  : trackedCount > 0
                    ? "No upcoming deadlines on your radar - you're clear."
                    : "Track a hackathon and its deadline shows up here."}
              </div>
            </div>
          </div>
          {urgent && (
            <a
              href={urgent.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full bg-coral px-6 py-3 text-center font-mono text-[11px] font-bold tracking-[0.15em] text-paper transition hover:bg-coral-bright"
            >
              FINISH APPLICATION →
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function TrackerCard({
  h,
  dragging,
  stageId,
  onDragStart,
  onDragEnd,
  onOpen,
  onRemove,
  onMoveStage,
}: {
  h: Hackathon;
  dragging: boolean;
  stageId: Stage;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onRemove: () => void;
  onMoveStage: (stage: Stage) => void;
}) {
  const meta = STATE_META[h.state];
  const cd = countdown(h);
  const stageIndex = STAGES.findIndex((stage) => stage.id === stageId);
  const prevStage = stageIndex > 0 ? STAGES[stageIndex - 1] : null;
  const nextStage = stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null;
  const onOpenKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={onOpenKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${h.title}`}
      aria-describedby={`tracker-stage-${stageId}`}
      className={`group cursor-grab rounded-2xl border border-white/10 bg-ink-soft p-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:cursor-grabbing ${
        dragging ? "opacity-40" : "hover:border-white/25"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="font-mono text-[8px] tracking-[0.2em]"
            style={{ color: meta.color }}
          >
            ● {meta.label}
          </div>
          <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-paper">
            {h.title}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-paper/40">
            {h.host}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          className="text-paper/25 opacity-0 transition group-hover:opacity-100 hover:text-coral"
        >
          ✕
        </button>
      </div>
      {cd && (
        <div
          className="mt-2 inline-block rounded-md px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em]"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {cd.toUpperCase()}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {prevStage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveStage(prevStage.id);
            }}
            aria-label={`Move ${h.title} to ${prevStage.label}`}
            className="rounded-full border border-white/20 px-3 py-1 font-mono text-[9px] tracking-[0.14em] text-paper/80 transition hover:border-white/35 hover:bg-white/10"
          >
            ← {prevStage.label.toUpperCase()}
          </button>
        )}
        {nextStage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveStage(nextStage.id);
            }}
            aria-label={`Move ${h.title} to ${nextStage.label}`}
            className="rounded-full border border-coral/40 px-3 py-1 font-mono text-[9px] tracking-[0.14em] text-coral transition hover:border-coral hover:bg-coral/12"
          >
            {nextStage.label.toUpperCase()} →
          </button>
        )}
      </div>
    </div>
  );
}
