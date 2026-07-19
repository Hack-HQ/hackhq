/** Client-safe types + display helpers shared across HackHQ components. */

import { REPO_URL } from "./repo";

export type HackState = "open" | "opens_soon" | "closing_soon" | "closed";

export type Hackathon = {
  id: string;
  host: string;
  title: string;
  tagline: string | null;
  url: string;
  location: string;
  format: "In-Person" | "Virtual" | "Hybrid";
  prize: string | null;
  prizeValue: number;
  state: HackState;
  deadline: string | null;
  daysLeft: number | null;
  lat: number | null;
  lng: number | null;
  themes: string[];
  postedAt: number;
};

export type SiteStats = {
  total: number;
  open: number;
  closingSoon: number;
  prizeDisplay: string;
  cities: number;
};

export const STATE_META: Record<
  HackState,
  { label: string; color: string; dim?: boolean }
> = {
  open: { label: "OPEN", color: "#17b26a" },
  opens_soon: { label: "OPENS SOON", color: "#f5a623" },
  closing_soon: { label: "CLOSING SOON", color: "#ed5b29" },
  closed: { label: "CLOSED", color: "#6b6560", dim: true },
};

export function countdown(h: Hackathon): string | null {
  if (h.daysLeft === null) return null;
  if (h.daysLeft < 0) return "closed";
  if (h.daysLeft === 0) return "closes today";
  if (h.daysLeft === 1) return "1 day left";
  if (h.daysLeft <= 45) return `${h.daysLeft} days left`;
  return null;
}

export function deadlineDisplay(h: Hackathon): string | null {
  if (!h.deadline) return null;
  const d = new Date(`${h.deadline}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Competitiveness rating shown on the globe Event Cartridge. */
export type Difficulty = 1 | 2 | 3; // 1 EASY, 2 MEDIUM, 3 HARD

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; color: string }
> = {
  1: { label: "EASY", color: "#17b26a" },
  2: { label: "MEDIUM", color: "#f5a623" },
  3: { label: "HARD", color: "#ed5b29" },
};

/**
 * Curated flagship events - recognizable, highly competitive regardless of the
 * listed prize (many post "TBA"). Matched case-insensitively against host+title.
 */
const FLAGSHIP_EVENTS = [
  "hack the north",
  "cal hacks",
  "calhacks",
  "pennapps",
  "hackmit",
  "treehacks",
  "la hacks",
  "lahacks",
  "mhacks",
  "hack the 6ix",
];

/**
 * Derive a competitiveness / "reputation" rating for an event. There is no
 * popularity field in the data, so we proxy it: prize scale + in-person format
 * + a curated flagship floor. Auto-scales as new events are added.
 */
export function difficultyOf(h: Hackathon): Difficulty {
  let score = 0;
  if (h.prizeValue >= 50_000) score += 2;
  else if (h.prizeValue >= 10_000) score += 1;
  if (h.format === "In-Person") score += 1;

  const haystack = `${h.host} ${h.title}`.toLowerCase();
  if (FLAGSHIP_EVENTS.some((name) => haystack.includes(name))) {
    score = Math.max(score, 3);
  }

  return score >= 3 ? 3 : score === 2 ? 2 : 1;
}

/** Prefilled GitHub issue for the Submit flow - keeps the engine, new surface. */
export function submitIssueUrl(name = "", url = ""): string {
  const title = encodeURIComponent(
    name ? `[Hackathon] ${name}` : "[Hackathon] Add a new event",
  );
  const body = encodeURIComponent(
    `**Hackathon name:** ${name || "…"}\n**URL:** ${url || "…"}\n**Location (City, ST or Online):** …\n**Deadline:** …\n**Prize pool:** …\n\n_Submitted via hackhq.dev - the pipeline will extract the rest._`,
  );
  return `${REPO_URL}/issues/new?title=${title}&body=${body}`;
}

export { REPO_URL };
