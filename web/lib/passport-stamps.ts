/* ---------------------------------------------------------------------------
   Passport stamp generator — derives ink-stamped visas from the local tracker.

   The My Passport artwork (components/hq/passport.tsx) was authored with eight
   hand-tuned stamps: every monogram, colour, rotation and coordinate picked per
   hackathon. Real tracked data arrives as arbitrary hackathons with none of
   that, so this module is the bridge: it turns a TrackerMap + the hackathon list
   into fully-placed stamps, deriving each visual property from the data.

   Kept as a pure, side-effect-free module (no React, no DOM) so the fiddly
   string logic — name cleaning, monogram derivation, location parsing — is unit
   tested in isolation (passport-stamps.test.ts).

   Which stage earns a stamp, and its label (issue #199):
     applied  -> VISA        accepted -> ADMITTED        going -> HACKED
   `interested` (a mere bookmark) earns nothing.
--------------------------------------------------------------------------- */

import type { Hackathon } from "./types-hq";
// Type-only import: erased at build, so this file stays free of the "use client"
// store module at runtime (and in tests).
import type { Stage } from "@/components/hq/store";

/** A tracker map: hackathon id -> pipeline stage. Mirrors store.tsx. */
export type TrackerMap = Record<string, Stage>;

/** A stage that earns a stamp (everything except `interested`). */
type StampStage = Exclude<Stage, "interested">;

/** A generated stamp, ready to hand to the passport's <StampMark>. */
export type PassportStamp = {
  id: string;
  top: string; // arc text along the top (hackathon name)
  sub: string; // arc text along the bottom (city · region)
  year: string;
  mono: string; // big monogram in the middle
  label: string; // HACKED / VISA / ADMITTED
  color: string;
  pos: { left: number; top: number; size: number };
  rotate: number;
  delay: number; // stamp-in animation delay, ms
  topSize?: number;
  subSize?: number;
  monoSize?: number;
};

export type Passport = {
  left: PassportStamp[]; // inside-left page (revealed under the cover)
  right: PassportStamp[]; // right base page
  stampCount: number;
  cityCount: number;
};

/* Stage -> stamp presentation. Colours mirror STAGES in store.tsx; the labels
   reuse the three variants the artwork already ships. */
const STAGE_STAMP: Record<StampStage, { label: string; color: string }> = {
  applied: { label: "VISA", color: "#f5a623" },
  accepted: { label: "ADMITTED", color: "#3b6bf0" },
  going: { label: "HACKED", color: "#ed5b29" },
};

function earnsStamp(stage: Stage): stage is StampStage {
  return stage !== "interested";
}

// Page geometry (matches the 340x470 pages in passport.tsx).
const PAGE_W = 340;
const PAGE_H = 470;
const PAD = 10;

const STOP_WORDS = new Set(["the", "of", "and", "a", "an", "for", "at"]);

/**
 * Clean a raw listing title down to a stamp-sized name. Real titles carry date
 * ranges and subtitles ("cuHacking 2026 - Jul 10 - Jul 12, 2026", "Arm Create:
 * AI Optimization Challenge"); keep only the leading identity segment.
 */
export function cleanName(title: string): string {
  let name = (title ?? "").trim();
  // Drop everything after the first " - " (loader turns em-dashes into " - ",
  // which is where date ranges and subtitles get appended) or first ": ".
  const dash = name.indexOf(" - ");
  if (dash !== -1) name = name.slice(0, dash);
  const colon = name.indexOf(": ");
  if (colon !== -1) name = name.slice(0, colon);
  // Strip a trailing standalone year ("cuHacking 2026" -> "cuHacking").
  name = name.replace(/\s+\d{4}$/, "");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

/**
 * A short monogram for the middle of the stamp. Multi-word names become the
 * initials of their first significant words ("Hack the North" -> "HTN"); a
 * single word becomes its first two letters ("MHacks" -> "MH"). Won't always
 * match a brand's own mark, but it's stable and legible.
 */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const pick = (significant.length >= 2 ? significant : words).slice(0, 3);
  if (pick.length >= 2) {
    return pick.map((w) => w[0]!.toUpperCase()).join("");
  }
  const only = pick[0] ?? name;
  return only.slice(0, 2).toUpperCase() || "HQ";
}

/**
 * Bottom-arc location text. "Ottawa, ON" -> "OTTAWA · ON"; online/virtual
 * events read "REMOTE"; TBA/unknown locations get no text.
 */
export function locationArc(location: string): string {
  const loc = (location ?? "").trim();
  if (!loc || /\b(tba|to be announced)\b/i.test(loc)) return "";
  if (/\b(online|virtual|remote)\b/i.test(loc)) return "REMOTE";
  const [city, ...rest] = loc.split(",").map((p) => p.trim());
  const region = rest.join(", ").trim();
  const cityText = (city ?? "").toUpperCase();
  return region ? `${cityText} · ${region.toUpperCase()}` : cityText;
}

/** A stable dedupe key for the city count: null for remote/TBA locations. */
export function cityKey(location: string): string | null {
  const loc = (location ?? "").trim();
  if (!loc) return null;
  if (/\b(tba|to be announced|online|virtual|remote)\b/i.test(loc)) return null;
  return loc.split(",")[0]!.trim().toLowerCase();
}

function eventYear(h: Hackathon): string {
  const iso = h.startDate ?? h.endDate ?? h.deadline;
  if (iso && /^\d{4}/.test(iso)) return iso.slice(0, 4);
  if (h.postedAt > 0) {
    // date_posted may be seconds or milliseconds; normalise to ms.
    const ms = h.postedAt < 1e12 ? h.postedAt * 1000 : h.postedAt;
    const year = new Date(ms).getUTCFullYear();
    if (year > 2000 && year < 2100) return String(year);
  }
  return "";
}

/** Sort key: when the event happened, so the passport reads chronologically. */
function eventTime(h: Hackathon): number {
  const iso = h.startDate ?? h.endDate ?? h.deadline;
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return h.postedAt > 0 ? (h.postedAt < 1e12 ? h.postedAt * 1000 : h.postedAt) : 0;
}

/** Deterministic 32-bit hash of a string (djb2). */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable per-stamp rotation in [-12, 11] degrees, keyed off the id. */
function rotateFor(id: string): number {
  return (hash(id) % 24) - 12;
}

function topSizeFor(top: string): number {
  if (top.length > 22) return 10;
  if (top.length > 17) return 12;
  if (top.length > 13) return 13;
  return 15;
}

function subSizeFor(sub: string): number {
  if (sub.length > 20) return 8.5;
  if (sub.length > 15) return 9.5;
  return 11;
}

/**
 * Grid layout for a single page. Density (columns and stamp size) scales with
 * the count so 1..9+ stamps all fit the fixed page — the "scale to fit" choice
 * from #199. `count` is the per-page target (both pages share it for symmetry),
 * `n` is how many stamps this page actually renders.
 */
function layoutPage(stamps: PassportStamp[], count: number): PassportStamp[] {
  const n = stamps.length;
  if (n === 0) return stamps;
  const cols = count <= 1 ? 1 : count <= 6 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (PAGE_W - 2 * PAD) / cols;
  const cellH = (PAGE_H - 2 * PAD) / rows;
  // Overlap factor >1 keeps the crowded, hand-placed feel; clamp for legibility.
  const size = Math.max(92, Math.min(206, Math.min(cellW, cellH) * 1.15));

  return stamps.map((s, i) => {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const inRow = Math.min(cols, n - rowStart);
    const col = i - rowStart;
    // Centre a partial last row.
    const rowOffset = ((cols - inRow) * cellW) / 2;
    const cx = PAD + rowOffset + cellW * (col + 0.5);
    const cy = PAD + cellH * (row + 0.5);
    // Small deterministic jitter so the grid doesn't read as mechanical.
    const jx = (hash(s.id + "x") % 17) - 8;
    const jy = (hash(s.id + "y") % 17) - 8;
    return {
      ...s,
      pos: { left: cx - size / 2 + jx, top: cy - size / 2 + jy, size },
    };
  });
}

function makeStamp(
  h: Hackathon,
  stage: StampStage,
  index: number,
): PassportStamp {
  const { label, color } = STAGE_STAMP[stage];
  const name = cleanName(h.title) || h.host || "HACKATHON";
  const top = name.toUpperCase();
  const sub = locationArc(h.location);
  const mono = monogram(name);
  return {
    id: h.id,
    top,
    sub,
    year: eventYear(h),
    mono,
    label,
    color,
    rotate: rotateFor(h.id),
    delay: index * 80,
    topSize: topSizeFor(top),
    subSize: subSizeFor(sub),
    monoSize: mono.length >= 3 ? 27 : 34,
    pos: { left: 0, top: 0, size: 0 }, // filled by layoutPage
  };
}

/**
 * Build the passport from the local tracker. Filters to stamp-earning stages,
 * resolves ids against the current listing set (dropping stale ones), sorts
 * chronologically, then splits and lays out the stamps across the two pages.
 */
export function buildPassport(
  tracked: TrackerMap,
  hackathons: Hackathon[],
): Passport {
  const byId = new Map(hackathons.map((h) => [h.id, h]));

  const earned = Object.entries(tracked)
    .filter((e): e is [string, StampStage] => earnsStamp(e[1]))
    .map(([id, stage]) => ({ h: byId.get(id), stage }))
    .filter((e): e is { h: Hackathon; stage: StampStage } => Boolean(e.h))
    .sort((a, b) => eventTime(a.h) - eventTime(b.h));

  const stamps = earned.map((e, i) => makeStamp(e.h, e.stage, i));

  // Split half/half; earliest events fill the left (inside-cover) page first.
  const perPage = Math.max(1, Math.ceil(stamps.length / 2));
  const left = layoutPage(stamps.slice(0, perPage), perPage);
  const right = layoutPage(stamps.slice(perPage), perPage);

  const cityCount = new Set(
    earned.map((e) => cityKey(e.h.location)).filter((k): k is string => Boolean(k)),
  ).size;

  return { left, right, stampCount: stamps.length, cityCount };
}
