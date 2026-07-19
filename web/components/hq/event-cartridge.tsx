"use client";

import { useEffect, useState } from "react";
import type { Hackathon } from "@/lib/types-hq";
import {
  STATE_META,
  countdown,
  deadlineDisplay,
  difficultyOf,
  DIFFICULTY_META,
} from "@/lib/types-hq";
import { useSelection, useTracker } from "./store";

const PAPER = "#f5ede6";
const PAPER_DIM = "rgba(245,237,230,0.78)";
const PAPER_FAINT = "rgba(245,237,230,0.42)";
const CHIP_BORDER = "1px solid rgba(245,237,230,0.12)";
const CHIP_BG = "rgba(245,237,230,0.04)";
const MONO = "var(--font-mono)";

/**
 * Left-anchored sliding detail card for the globe view - the "Event Cartridge".
 * Reads the shared selection + tracker. Replaces the centered DetailModal on
 * /globe only (wired via PageShell's `detail` prop).
 */
export function EventCartridge({
  hackathons = [],
}: {
  hackathons?: Hackathon[];
}) {
  const { selected, setSelected } = useSelection();
  const { isTracked, save, remove } = useTracker();

  // `display` is the event currently painted - it lingers through the exit
  // animation so the card doesn't blank before it slides away. `shown` drives
  // the slide/fade.
  const [display, setDisplay] = useState<Hackathon | null>(selected);
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Post-mount browser read (window is unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    // All state updates are deferred into rAF/timeout callbacks so the exit
    // animation can play before unmount without synchronous effect setState.
    let raf1 = 0;
    let raf2 = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const slideIn = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
    };

    if (selected) {
      if (!display) {
        // Fresh open: paint, then slide in.
        raf1 = requestAnimationFrame(() => {
          setDisplay(selected);
          raf2 = requestAnimationFrame(() => setShown(true));
        });
      } else if (selected.id !== display.id) {
        // Switch events: slide the old card out, swap, slide the new one in.
        raf1 = requestAnimationFrame(() => setShown(false));
        timer = setTimeout(
          () => {
            setDisplay(selected);
            slideIn();
          },
          reduced ? 0 : 280,
        );
      }
    } else if (display) {
      // Closing: slide out, then unmount.
      raf1 = requestAnimationFrame(() => setShown(false));
      timer = setTimeout(() => setDisplay(null), reduced ? 0 : 300);
    }

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (timer) clearTimeout(timer);
    };
  }, [selected, display, reduced]);

  // Escape closes the card.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, setSelected]);

  if (!display) return null;

  const h = display;
  const meta = STATE_META[h.state];
  const diff = difficultyOf(h);
  const diffMeta = DIFFICULTY_META[diff];
  const cd = countdown(h);
  const tracked = isTracked(h.id);

  const located = hackathons.filter((x) => x.lat !== null && x.lng !== null);
  const idx = located.findIndex((x) => x.id === h.id);
  const indexLabel =
    idx >= 0
      ? `${String(idx + 1).padStart(2, "0")} / ${String(located.length).padStart(2, "0")}`
      : "01 / 01";

  const countdownText = cd
    ? cd.toUpperCase()
    : h.state === "opens_soon"
      ? "NOT YET OPEN"
      : "SEE WEBSITE";
  const monogram = h.host.trim().charAt(0).toUpperCase() || "H";

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: 46,
        transform: "translateY(-50%)",
        zIndex: 50,
        width: 374,
        maxWidth: "calc(100vw - 92px)",
        pointerEvents: shown ? "auto" : "none",
      }}
    >
      <div
        style={{
          position: "relative",
          transformOrigin: "center left",
          willChange: "transform",
          transform: shown
            ? "rotate(-3.5deg) translateX(0)"
            : "rotate(-9deg) translateX(-135%)",
          opacity: shown ? 1 : 0,
          transition: reduced
            ? "opacity 200ms ease"
            : "transform 280ms cubic-bezier(.4,0,.2,1), opacity 220ms ease",
        }}
      >
        {/* glow behind card */}
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 30,
            background:
              "linear-gradient(180deg, rgba(237,91,41,0.55), rgba(237,91,41,0.12))",
            filter: "blur(22px)",
            opacity: 0.55,
            zIndex: -1,
          }}
        />

        <div
          style={{
            position: "relative",
            borderRadius: 28,
            overflow: "hidden",
            background: "#100f0f",
            border: "1px solid rgba(245,237,230,0.14)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.65)",
          }}
        >
          {/* vertical edge index label */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(245,237,230,0.03)",
              borderRight: "1px solid rgba(245,237,230,0.07)",
              zIndex: 5,
            }}
          >
            <span
              style={{
                writingMode: "vertical-rl",
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.34em",
                color: "rgba(245,237,230,0.32)",
                textTransform: "uppercase",
              }}
            >
              HQ · {indexLabel}
            </span>
          </div>

          <div style={{ marginLeft: 26 }}>
            {/* PHOTO - status-tinted gradient placeholder */}
            <div
              style={{
                position: "relative",
                height: 188,
                background: `linear-gradient(150deg, ${meta.color}33 0%, #1b1917 62%)`,
              }}
            >
              {/* dot texture */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "radial-gradient(rgba(245,237,230,0.07) 1px, transparent 1.6px)",
                  backgroundSize: "16px 16px",
                  opacity: 0.9,
                }}
              />
              {/* scrim */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(16,15,15,0.55) 0%, transparent 34%, transparent 62%, rgba(16,15,15,0.92) 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* difficulty badge */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 6,
                  zIndex: 3,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: diffMeta.color,
                  }}
                >
                  {diffMeta.label}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3].map((n) => {
                    const on = n <= diff;
                    return (
                      <span
                        key={n}
                        style={{
                          width: 15,
                          height: 6,
                          borderRadius: 2,
                          background: on
                            ? diffMeta.color
                            : "rgba(245,237,230,0.16)",
                          boxShadow: on
                            ? `0 0 8px ${diffMeta.color}99`
                            : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* status pill */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "rgba(12,10,8,0.6)",
                  border: CHIP_BORDER,
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: meta.color,
                  zIndex: 3,
                }}
              >
                ● {meta.label}
              </div>

              {/* close */}
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{
                  position: "absolute",
                  bottom: -18,
                  right: 16,
                  zIndex: 6,
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  border: "1px solid rgba(245,237,230,0.16)",
                  background: "rgba(12,10,8,0.72)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  color: "rgba(245,237,230,0.8)",
                  fontSize: 15,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* ORG LOGO monogram badge overlapping */}
            <div style={{ position: "relative", padding: "0 22px" }}>
              <div
                style={{
                  position: "absolute",
                  top: -30,
                  left: 20,
                  width: 58,
                  height: 58,
                  borderRadius: 16,
                  background: "#100f0f",
                  border: "1px solid rgba(245,237,230,0.16)",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  color: "#ed5b29",
                }}
              >
                {monogram}
              </div>
            </div>

            {/* BODY */}
            <div style={{ padding: "34px 22px 20px" }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "#ed5b29",
                }}
              >
                {h.host}
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.06,
                  fontSize: 22,
                  margin: "9px 0 0",
                  color: PAPER,
                }}
              >
                {h.title}
              </h2>

              {/* meta chips */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginTop: 14,
                }}
              >
                <span style={chipStyle}>
                  <svg
                    width="9"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M12 2C7.58 2 4 5.58 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.42-3.58-8-8-8zm0 10.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                  </svg>
                  {h.location}
                </span>
                <span style={chipStyle}>{h.format}</span>
              </div>

              {/* STAT PANEL */}
              <div
                style={{
                  marginTop: 18,
                  borderRadius: 16,
                  border: "1px solid rgba(245,237,230,0.10)",
                  background: "rgba(245,237,230,0.03)",
                  overflow: "hidden",
                }}
              >
                <StatRow label="Deadline">
                  <span style={{ fontFamily: MONO, fontSize: 11, color: PAPER }}>
                    {deadlineDisplay(h) ?? "See website"}
                  </span>
                </StatRow>
                <StatRow label="Prize Pool">
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 13,
                      color: PAPER,
                    }}
                  >
                    {h.prize ?? "TBA"}
                  </span>
                </StatRow>
                <StatRow label="Countdown" last>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: cd ? meta.color : "rgba(245,237,230,0.55)",
                    }}
                  >
                    {countdownText}
                  </span>
                </StatRow>
              </div>

              {/* ACTIONS */}
              <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: 14,
                    borderRadius: 999,
                    background: "#ed5b29",
                    color: PAPER,
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                  }}
                >
                  {h.state === "opens_soon" ? "VISIT SITE ↗" : "REGISTER ↗"}
                </a>
                <button
                  onClick={() => (tracked ? remove(h.id) : save(h.id))}
                  aria-label={tracked ? "Untrack event" : "Save event"}
                  style={{
                    width: 52,
                    flexShrink: 0,
                    padding: "14px 0",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: `1px solid ${tracked ? "#ed5b29" : "rgba(245,237,230,0.2)"}`,
                    background: tracked ? "rgba(237,91,41,0.16)" : "transparent",
                    color: tracked ? "#ed5b29" : "rgba(245,237,230,0.85)",
                    fontSize: 16,
                  }}
                >
                  {tracked ? "♥" : "♡"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 11px",
  borderRadius: 999,
  border: CHIP_BORDER,
  background: CHIP_BG,
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: "0.1em",
  color: PAPER_DIM,
};

function StatRow({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 15px",
        borderBottom: last ? "none" : "1px solid rgba(245,237,230,0.07)",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: PAPER_FAINT,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
