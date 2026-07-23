"use client";

import { useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   My Passport — Members · Pillar 03

   A React port of the "My Passport.dc.html" Claude Design component. A
   collectible hacker passport that flips open in 3D to reveal ink-stamped
   visas for every hackathon you've hacked. The original was authored in
   Claude Design's DCLogic format; this keeps the artwork pixel-faithful
   (leather cover, foil crest, guilloché pages, turbulence-warped stamps)
   while adapting it to the app: project font tokens, reduced-motion support,
   and a responsively scaled stage that lives inside a page shell rather than
   a fixed full-screen overlay.
--------------------------------------------------------------------------- */

// Natural size of the passport spread (two 340px pages). The stage scales this
// down to fit narrow viewports; see the ResizeObserver below.
const BOOK_W = 680;
const BOOK_H = 470;

type Stamp = {
  id: string;
  top: string; // arc text along the top
  sub: string; // arc text along the bottom
  year: string;
  mono: string; // big monogram in the middle
  label: string; // HACKED / VISA / ADMITTED
  color: string;
  pos: { left: number; top: number; size: number };
  rotate: number;
  delay: number; // stamp-in animation delay, ms
  ringOpacity?: number;
  inkOpacity?: number;
  topSize?: number;
  topLS?: number;
  subSize?: number;
  subLS?: number;
  monoSize?: number;
};

// Inside-left page (revealed under the opening cover).
const STAMPS_LEFT: Stamp[] = [
  {
    id: "htn",
    top: "HACK THE NORTH",
    sub: "TORONTO · ON",
    year: "2024",
    mono: "HTN",
    label: "HACKED",
    color: "#ed5b29",
    pos: { left: -6, top: 8, size: 196 },
    rotate: -8,
    delay: 0,
    topSize: 13,
    topLS: 1.2,
  },
  {
    id: "pennapps",
    top: "PENNAPPS",
    sub: "PHILADELPHIA · PA",
    year: "2024",
    mono: "PA",
    label: "VISA",
    color: "#7a4bd0",
    pos: { left: 150, top: 30, size: 190 },
    rotate: 9,
    delay: 160,
    ringOpacity: 0.9,
    inkOpacity: 0.88,
    subSize: 10,
    subLS: 1.8,
  },
  {
    id: "mhacks",
    top: "MHACKS",
    sub: "ANN ARBOR · MI",
    year: "2024",
    mono: "MH",
    label: "ADMITTED",
    color: "#17b26a",
    pos: { left: 22, top: 205, size: 190 },
    rotate: 6,
    delay: 320,
  },
  {
    id: "h6ix",
    top: "HACK THE 6IX",
    sub: "TORONTO · ON",
    year: "2025",
    mono: "H6",
    label: "HACKED",
    color: "#ff7a45",
    pos: { left: 140, top: 238, size: 190 },
    rotate: -13,
    delay: 480,
    ringOpacity: 0.9,
    topSize: 14,
    topLS: 1.4,
  },
];

// Right page (the base spread).
const STAMPS_RIGHT: Stamp[] = [
  {
    id: "lahacks",
    top: "LA HACKS",
    sub: "LOS ANGELES · CA",
    year: "2025",
    mono: "LA",
    label: "HACKED",
    color: "#3b6bf0",
    pos: { left: 12, top: 14, size: 196 },
    rotate: -10,
    delay: 80,
  },
  {
    id: "bitcamp",
    top: "BITCAMP",
    sub: "COLLEGE PARK · MD",
    year: "2025",
    mono: "BC",
    label: "VISA",
    color: "#c98a2b",
    pos: { left: 150, top: 44, size: 190 },
    rotate: 8,
    delay: 240,
  },
  {
    id: "cuhacking",
    top: "CUHACKING",
    sub: "OTTAWA · ON",
    year: "2025",
    mono: "cuH",
    label: "ADMITTED",
    color: "#17b26a",
    pos: { left: -4, top: 232, size: 190 },
    rotate: 12,
    delay: 400,
    topSize: 14,
    topLS: 1.6,
    monoSize: 30,
  },
  {
    id: "hackumass",
    top: "HACKUMASS",
    sub: "AMHERST · MA",
    year: "2023",
    mono: "UM",
    label: "HACKED",
    color: "#b0552f",
    pos: { left: 150, top: 250, size: 190 },
    rotate: -6,
    delay: 560,
    ringOpacity: 0.85,
    inkOpacity: 0.82,
    topSize: 14,
    topLS: 1.6,
  },
];

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";

/* Shared turbulence filters that give every stamp its rough, hand-inked edge.
   Rendered once, referenced by url(#…) from all stamp SVGs. */
function InkFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id="pp-ink" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.013 0.015"
            numOctaves="3"
            seed="7"
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale="4"
            result="disp"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.36"
            numOctaves="2"
            seed="7"
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.05 1.04"
            result="patch"
          />
          <feComposite in="disp" in2="patch" operator="in" />
        </filter>
        <filter id="pp-ink-t" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.03"
            numOctaves="2"
            seed="4"
            result="tw"
          />
          <feDisplacementMap in="SourceGraphic" in2="tw" scale="2.2" />
        </filter>
      </defs>
    </svg>
  );
}

function StampMark({ stamp, index }: { stamp: Stamp; index: number }) {
  const {
    top,
    sub,
    year,
    mono,
    label,
    color,
    ringOpacity = 0.92,
    inkOpacity = 0.9,
    topSize = 15,
    topLS = 2.2,
    subSize = 11,
    subLS = 2.4,
    monoSize = 34,
  } = stamp;
  const tA = `pp-arc-a-${index}`;
  const tB = `pp-arc-b-${index}`;

  return (
    <svg
      viewBox="0 0 220 220"
      width="100%"
      height="100%"
      style={{ mixBlendMode: "multiply", overflow: "visible" }}
      aria-hidden
    >
      <defs>
        <path id={tA} d="M30,112 A82,82 0 0,1 190,112" fill="none" />
        <path id={tB} d="M36,110 A74,74 0 0,0 184,110" fill="none" />
      </defs>
      <g filter="url(#pp-ink)" fill="none" stroke={color} opacity={ringOpacity}>
        <circle cx="110" cy="110" r="95" strokeWidth="4.5" />
        <circle cx="110" cy="110" r="80" strokeWidth="2" />
        <circle cx="110" cy="110" r="88" strokeWidth="2" strokeDasharray="1.5 6.5" />
        <line x1="82" y1="133" x2="138" y2="133" strokeWidth="1.6" />
        <path d="M60,110 l3.2,-6.6 3.2,6.6 -6.4,-4.2 h6.4 z" fill={color} stroke="none" />
        <path d="M160,110 l-3.2,-6.6 -3.2,6.6 6.4,-4.2 h-6.4 z" fill={color} stroke="none" />
      </g>
      <g filter="url(#pp-ink-t)" fill={color} opacity={inkOpacity}>
        <text fontWeight="700" fontSize={topSize} letterSpacing={topLS} style={{ fontFamily: MONO }}>
          <textPath href={`#${tA}`} startOffset="50%" textAnchor="middle">
            {top}
          </textPath>
        </text>
        <text fontWeight="400" fontSize={subSize} letterSpacing={subLS} style={{ fontFamily: MONO }}>
          <textPath href={`#${tB}`} startOffset="50%" textAnchor="middle">
            {sub}
          </textPath>
        </text>
        <text x="110" y="80" fontWeight="700" fontSize="10.5" letterSpacing="2" textAnchor="middle" style={{ fontFamily: MONO }}>
          {year}
        </text>
        <text x="110" y="124" fontWeight="700" fontSize={monoSize} textAnchor="middle" style={{ fontFamily: DISPLAY }}>
          {mono}
        </text>
        <text x="110" y="149" fontWeight="700" fontSize="9" letterSpacing="3" textAnchor="middle" style={{ fontFamily: MONO }}>
          {label}
        </text>
      </g>
    </svg>
  );
}

function StampLayer({
  stamps,
  indexOffset,
  visible,
}: {
  stamps: Stamp[];
  indexOffset: number;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {stamps.map((s, i) => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: s.pos.left,
            top: s.pos.top,
            width: s.pos.size,
            height: s.pos.size,
            transform: `rotate(${s.rotate}deg)`,
          }}
        >
          <div className="pp-stamp" style={{ width: "100%", height: "100%", animationDelay: `${s.delay}ms` }}>
            <StampMark stamp={s} index={indexOffset + i} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* The foil crest on the cover: a trench-coated "incognito hacker" seal. */
function CoverCrest() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="108"
      height="108"
      style={{
        filter:
          "drop-shadow(0 -0.6px 0.4px rgba(0,0,0,0.6)) drop-shadow(0 1px 0.5px rgba(255,238,200,0.28))",
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="pp-seal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c5a1f" />
          <stop offset="38%" stopColor="#e7c874" />
          <stop offset="50%" stopColor="#f6e6b4" />
          <stop offset="66%" stopColor="#c9992f" />
          <stop offset="100%" stopColor="#7a5417" />
        </linearGradient>
      </defs>
      <g fill="url(#pp-seal)" stroke="url(#pp-seal)">
        <circle cx="50" cy="50" r="45.5" fill="none" strokeWidth="0.7" strokeDasharray="0.5 3.2" />
        <path d="M15,26 l0.8,1.8 1.9,0.2 -1.45,1.25 0.45,1.9 -1.7,-1 -1.7,1 0.45,-1.9 -1.45,-1.25 1.9,-0.2 z" />
        <path d="M85,26 l0.8,1.8 1.9,0.2 -1.45,1.25 0.45,1.9 -1.7,-1 -1.7,1 0.45,-1.9 -1.45,-1.25 1.9,-0.2 z" />
      </g>
      <g fill="url(#pp-seal)" stroke="#17110c" strokeWidth="0.6" strokeLinejoin="round">
        <path d="M48,56 L28,59 L37,68 L27,86 L43,80 L47,62 Z" />
        <path d="M52,56 L72,59 L63,68 L73,86 L57,80 L53,62 Z" />
      </g>
      <path d="M49.4,58 L47,84" fill="none" stroke="#17110c" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M50.6,58 L53,84" fill="none" stroke="#17110c" strokeWidth="0.9" strokeLinecap="round" />
      <path
        d="M6,43.5 C18,38 32,36.5 50,36.5 C68,36.5 82,38 94,43.5 C86,48.5 70,50.5 50,50.5 C30,50.5 14,48.5 6,43.5 Z"
        fill="url(#pp-seal)"
        stroke="#17110c"
        strokeWidth="0.6"
      />
      <path
        d="M12,42.5 C26,39.5 40,38.5 50,38.5 C60,38.5 74,39.5 88,42.5"
        fill="none"
        stroke="#17110c"
        strokeWidth="0.7"
        strokeLinecap="round"
      />
      <path
        d="M33,37 C32,23 36,11 44,8 C46.5,12 48,14 50,14 C52,14 53.5,12 56,8 C64,11 68,23 67,37 Z"
        fill="url(#pp-seal)"
        stroke="#17110c"
        strokeWidth="0.6"
      />
      <path d="M32.5,34 C40,32 60,32 67.5,34" fill="none" stroke="#17110c" strokeWidth="2.4" strokeLinecap="round" />
      <path
        fillRule="evenodd"
        fill="url(#pp-seal)"
        stroke="#17110c"
        strokeWidth="0.5"
        d="M37,51 C37,49.8 38,49.3 40,49.3 L48,49.3 C49.2,49.3 49.6,49.8 50,50.6 C50.4,49.8 50.8,49.3 52,49.3 L60,49.3 C62,49.3 63,49.8 63,51 C63.5,54.2 61.5,58.6 56.5,58.8 C52.2,59 50.8,56 50,54 C49.2,56 47.8,59 43.5,58.8 C38.5,58.6 36.5,54.2 37,51 Z M39,51.5 C41.5,50.6 45,50.6 47.5,51.6 C47.6,54 46,57 43,57 C40,57 38.6,54.2 39,51.5 Z M61,51.5 C58.5,50.6 55,50.6 52.5,51.6 C52.4,54 54,57 57,57 C60,57 61.4,54.2 61,51.5 Z"
      />
    </svg>
  );
}

type Phase = "closed" | "flash" | "open";

export function Passport({
  stampCount = "08",
  cities = "07",
}: {
  stampCount?: string;
  cities?: string;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [opened, setOpened] = useState(false);
  const [scale, setScale] = useState(1);
  const [reduced, setReduced] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  // Respect the OS "reduce motion" setting — skip the flip/wobble choreography.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Scale the fixed-size spread down to fit the available width.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / BOOK_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const open = () => {
    if (phase !== "closed") return;
    clearTimers();
    if (reduced) {
      setPhase("open");
      setOpened(true);
      return;
    }
    setPhase("flash");
    timers.current.push(setTimeout(() => setPhase("open"), 420));
    timers.current.push(setTimeout(() => setOpened(true), 420 + 720));
  };

  const close = () => {
    clearTimers();
    setOpened(false);
    setPhase("closed");
  };

  const closed = phase === "closed";
  const bookTransform =
    phase === "open"
      ? "translateX(0px) translateZ(0.01px) rotateZ(0deg) scale(1)"
      : phase === "flash"
        ? "translateX(-170px) translateZ(0.01px) rotateZ(0deg) scale(1)"
        : "translateX(-170px) translateZ(0.01px) rotateZ(-4deg) scale(0.94)";
  const coverRotate = phase === "open" ? "-168deg" : "0deg";
  const bookTransition = reduced
    ? "none"
    : "transform 820ms cubic-bezier(.22,1,.32,1)";
  const coverTransition = reduced
    ? "none"
    : "transform 1100ms cubic-bezier(.5,.05,.2,1)";

  return (
    <section className="p-2 pt-0">
      <div
        className="shell flex min-h-[560px] flex-col px-5 py-10 sm:min-h-[640px] sm:px-10 sm:py-12"
        style={{
          background:
            "radial-gradient(75% 70% at 50% 40%, #241811 0%, #16110d 55%, #0a0807 100%)",
        }}
      >
        <InkFilters />

        {/* Header chrome */}
        <div className="relative z-10">
          <div className="kicker text-coral">Members · Pillar 03</div>
          <h2 className="display mt-2 text-[clamp(1.5rem,3vw,2.4rem)] text-paper">
            My Passport
          </h2>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            {stampCount} stamps · {cities} cities
          </div>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          className="flex flex-1 items-center justify-center py-8"
        >
          <div
            style={{
              width: BOOK_W * scale,
              height: BOOK_H * scale,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: BOOK_W,
                height: BOOK_H,
                transformOrigin: "top left",
                transform: `scale(${scale})`,
                perspective: "2200px",
              }}
            >
              <div
                onClick={open}
                style={{
                  position: "relative",
                  width: BOOK_W,
                  height: BOOK_H,
                  transformStyle: "preserve-3d",
                  transform: bookTransform,
                  transition: bookTransition,
                  cursor: closed ? "pointer" : "default",
                }}
              >
                {/* Contact shadow */}
                <div
                  style={{
                    position: "absolute",
                    left: "8%",
                    right: "8%",
                    bottom: -26,
                    height: 40,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(50% 100% at 50% 0, rgba(0,0,0,0.55), transparent 75%)",
                    filter: "blur(8px)",
                    transform: "translateZ(-40px)",
                  }}
                />

                {/* RIGHT PAGE (base) */}
                <div
                  style={{
                    position: "absolute",
                    left: 340,
                    top: 0,
                    width: 340,
                    height: 470,
                    borderRadius: "6px 16px 16px 6px",
                    overflow: "hidden",
                    background:
                      "linear-gradient(90deg, #e2d7c6 0%, #efe6d9 12%, #f1e9dd 100%)",
                    boxShadow:
                      "inset 22px 0 40px -22px rgba(80,58,36,0.55), inset 0 0 60px rgba(120,95,60,0.08)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage:
                        "repeating-radial-gradient(circle at 60% 46%, rgba(120,95,60,0.06) 0, rgba(120,95,60,0.06) 1px, transparent 1px, transparent 9px), repeating-radial-gradient(circle at 20% 78%, rgba(120,95,60,0.05) 0, rgba(120,95,60,0.05) 1px, transparent 1px, transparent 13px)",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.05,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 130,
                        color: "#6b4a28",
                        letterSpacing: -6,
                      }}
                    >
                      HQ
                    </div>
                  </div>
                  <div style={{ position: "absolute", top: 16, right: 20, textAlign: "right", zIndex: 2 }}>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.28em", color: "rgba(90,66,40,0.75)", textTransform: "uppercase" }}>
                      Visas · Stamps
                    </div>
                    <div style={{ width: 92, height: 2, background: "rgba(90,66,40,0.35)", margin: "6px 0 0 auto" }} />
                  </div>
                  <div style={{ position: "absolute", bottom: 14, right: 20, fontFamily: MONO, fontSize: 8, letterSpacing: "0.2em", color: "rgba(90,66,40,0.55)" }}>
                    P. 04
                  </div>

                  <StampLayer stamps={STAMPS_RIGHT} indexOffset={10} visible={opened} />
                </div>

                {/* COVER (rotates open) */}
                <div
                  style={{
                    position: "absolute",
                    left: 340,
                    top: 0,
                    width: 340,
                    height: 470,
                    transformStyle: "preserve-3d",
                    transformOrigin: "left center",
                    transform: `rotateY(${coverRotate}) translateZ(24px)`,
                    transition: coverTransition,
                  }}
                >
                  {/* FRONT = cover art */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: phase === "open" ? 0 : 1,
                      transition: "opacity 0s linear 540ms",
                      borderRadius: "6px 16px 16px 6px",
                      overflow: "hidden",
                      background:
                        "radial-gradient(120% 120% at 30% 20%, #241a12 0%, #1a130d 45%, #120d09 100%)",
                      boxShadow:
                        "inset 0 0 60px rgba(0,0,0,0.55), 0 30px 70px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0.55,
                        backgroundImage:
                          "repeating-linear-gradient(96deg, rgba(0,0,0,0.16) 0, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(6deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 5px)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage:
                          "radial-gradient(40% 30% at 26% 18%, rgba(255,236,205,0.10), transparent 70%), radial-gradient(50% 40% at 80% 88%, rgba(0,0,0,0.28), transparent 72%)",
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 22,
                        borderRadius: 9,
                        boxShadow:
                          "inset 0 2px 2px rgba(0,0,0,0.55), inset 0 -2px 1px rgba(255,232,190,0.14), 0 1px 0 rgba(255,232,190,0.10)",
                        border: "1px solid rgba(120,86,30,0.55)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 28,
                        borderRadius: 6,
                        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
                        border: "1px solid rgba(120,86,30,0.35)",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "46px 34px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.32em", textTransform: "uppercase", color: "#c19a48", textShadow: "0 -1px 0.5px rgba(0,0,0,0.6), 0 1px 0.5px rgba(255,238,200,0.22)" }}>
                        Global Hackathon Union
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, marginTop: 6 }}>
                        <div
                          style={{
                            width: 116,
                            height: 116,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            border: "2px solid rgba(120,86,30,0.6)",
                            boxShadow:
                              "inset 0 2px 3px rgba(0,0,0,0.55), inset 0 -2px 2px rgba(255,235,190,0.16), 0 1px 0 rgba(255,232,190,0.12), 0 0 26px rgba(237,91,41,0.10)",
                          }}
                        >
                          <div style={{ position: "absolute", inset: 9, borderRadius: "50%", border: "1px solid rgba(120,86,30,0.45)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)" }} />
                          <CoverCrest />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div
                            style={{
                              fontFamily: DISPLAY,
                              fontWeight: 700,
                              fontSize: 27,
                              letterSpacing: "0.02em",
                              lineHeight: 1.15,
                              background:
                                "linear-gradient(178deg, #7c5a1f 0%, #d9c084 42%, #efe0ac 50%, #bd9236 66%, #6f4d17 100%)",
                              WebkitBackgroundClip: "text",
                              backgroundClip: "text",
                              color: "transparent",
                              filter:
                                "drop-shadow(0 -1px 0.5px rgba(0,0,0,0.6)) drop-shadow(0 1.5px 0.5px rgba(255,238,200,0.26))",
                            }}
                          >
                            HACKER
                          </div>
                          <div
                            style={{
                              fontFamily: DISPLAY,
                              fontWeight: 700,
                              fontSize: 27,
                              letterSpacing: "0.02em",
                              lineHeight: 1.15,
                              background:
                                "linear-gradient(178deg, #8a621d 0%, #e7c874 40%, #f6e6b4 50%, #c9992f 64%, #7a5417 100%)",
                              WebkitBackgroundClip: "text",
                              backgroundClip: "text",
                              color: "transparent",
                              filter:
                                "drop-shadow(0 -1px 0.5px rgba(0,0,0,0.65)) drop-shadow(0 1.5px 0.5px rgba(255,238,200,0.3))",
                            }}
                          >
                            PASSPORT
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 42,
                            height: 31,
                            borderRadius: 6,
                            position: "relative",
                            background:
                              "linear-gradient(150deg, #d9bd6f 0%, #a9791f 45%, #e6cf8a 100%)",
                            boxShadow:
                              "inset 0 1px 1px rgba(255,244,214,0.4), inset 0 -2px 3px rgba(0,0,0,0.45), 0 1px 1px rgba(0,0,0,0.5)",
                            border: "1px solid rgba(90,63,20,0.6)",
                          }}
                        >
                          <div style={{ position: "absolute", inset: 6, border: "1px solid rgba(90,63,20,0.5)", borderRadius: 3, boxShadow: "inset 0 1px 1px rgba(0,0,0,0.35)" }} />
                          <div style={{ position: "absolute", left: "50%", top: 4, bottom: 4, width: 1, background: "rgba(90,63,20,0.5)" }} />
                          <div style={{ position: "absolute", top: "50%", left: 4, right: 4, height: 1, background: "rgba(90,63,20,0.5)" }} />
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.3em", color: "#b9934a", textShadow: "0 -0.5px 0.5px rgba(0,0,0,0.55), 0 1px 0.5px rgba(255,238,200,0.2)" }}>
                          TYPE H · HQ · CODE 2026
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BACK = inside-left page */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: phase === "open" ? 1 : 0,
                      transition: "opacity 0s linear 540ms",
                      transform: "rotateY(180deg) translateZ(1px)",
                      borderRadius: "16px 6px 6px 16px",
                      overflow: "hidden",
                      background:
                        "linear-gradient(90deg, #f1e9dd 0%, #efe6d9 88%, #e2d7c6 100%)",
                      boxShadow:
                        "inset -22px 0 40px -22px rgba(80,58,36,0.55), inset 0 0 60px rgba(120,95,60,0.08)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage:
                          "repeating-radial-gradient(circle at 38% 40%, rgba(120,95,60,0.06) 0, rgba(120,95,60,0.06) 1px, transparent 1px, transparent 9px), repeating-radial-gradient(circle at 78% 76%, rgba(120,95,60,0.05) 0, rgba(120,95,60,0.05) 1px, transparent 1px, transparent 13px)",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ position: "absolute", top: 16, left: 20, zIndex: 2 }}>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.28em", color: "rgba(90,66,40,0.75)", textTransform: "uppercase" }}>
                        Holder · Hacks
                      </div>
                      <div style={{ width: 92, height: 2, background: "rgba(90,66,40,0.35)", marginTop: 6 }} />
                    </div>
                    <div style={{ position: "absolute", bottom: 14, left: 20, fontFamily: MONO, fontSize: 8, letterSpacing: "0.2em", color: "rgba(90,66,40,0.55)" }}>
                      P. 03
                    </div>

                    <StampLayer stamps={STAMPS_LEFT} indexOffset={0} visible={opened} />
                  </div>
                </div>

                {/* Spine shadow */}
                <div
                  style={{
                    position: "absolute",
                    left: 340,
                    top: 0,
                    width: 34,
                    height: 470,
                    transform: "translateX(-17px)",
                    pointerEvents: "none",
                    zIndex: 30,
                    background:
                      "linear-gradient(90deg, transparent, rgba(60,42,26,0.28) 42%, rgba(40,28,16,0.4) 50%, rgba(60,42,26,0.28) 58%, transparent)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Open / close control */}
        <div className="relative z-10 flex justify-center">
          <button
            type="button"
            onClick={closed ? open : close}
            aria-expanded={!closed}
            className="glass-dark flex items-center gap-2.5 rounded-full px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-paper transition hover:border-white/25"
          >
            <span
              className="h-[7px] w-[7px] rounded-full bg-coral"
              style={{ boxShadow: "0 0 10px rgba(237,91,41,0.9)" }}
            />
            {closed ? "Open my passport" : "Close passport"}
          </button>
        </div>
      </div>
    </section>
  );
}
