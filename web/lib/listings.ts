import fs from "node:fs";
import path from "node:path";

/**
 * Reads the repo's source-of-truth listings.json directly (no README
 * re-parsing) and enriches each record for the frontend:
 *  - derived status (open / opens_soon / closing_soon / closed) from deadline
 *  - lat/lng from a static geocode table (one entry per unique location)
 *  - days-until-deadline, cleaned titles, theme tags, prize parsing
 */

import type { HackState, Hackathon, SiteStats } from "./types-hq";

export type { HackState, Hackathon, SiteStats };

const LISTINGS_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "scripts",
  "listings.json",
);

type RawListing = {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations?: string[];
  format?: string;
  prize?: string;
  state?: string;
  active?: boolean;
  is_visible?: boolean;
  date_posted?: number;
  deadline?: string;
};

/** Static geocode table - one entry per unique location string in listings.json. */
const GEO: Record<string, [number, number]> = {
  "Amherst, MA": [42.3732, -72.5199],
  "Ann Arbor, MI": [42.2808, -83.743],
  "Austin, TX": [30.2672, -97.7431],
  "Berkeley / San Francisco, CA": [37.8715, -122.273],
  "Boston, MA": [42.3601, -71.0589],
  "Cambridge, MA": [42.3736, -71.1097],
  "College Park, MD": [38.9897, -76.9378],
  "Kolkata, India": [22.5726, 88.3639],
  "Los Angeles, CA": [34.0522, -118.2437],
  "New York, NY": [40.7128, -74.006],
  "Philadelphia, PA": [39.9526, -75.1652],
  "San Francisco, CA": [37.7749, -122.4194],
  "Toronto, ON, Canada": [43.6532, -79.3832],
};

const THEME_RULES: [RegExp, string][] = [
  [/\bai\b|artificial intelligence|agent|llm|gpt|gemini|claude/i, "AI"],
  [/web3|crypto|\beth(ereum)?\b|blockchain|\bchain\b/i, "WEB3"],
  [/health|\bbio(tech|medical)?\b|\bmed(ical|icine|tech)?\b/i, "HEALTH"],
  [/climate|sustain|energy/i, "CLIMATE"],
  [/fintech|finance|trading|\bquant\b/i, "FINTECH"],
  [/game|gaming/i, "GAMING"],
  [/robot|hardware|embedded/i, "HARDWARE"],
  [/security|cyber|ctf/i, "SECURITY"],
  [/\bdata\b|analytics/i, "DATA"],
  [/space|aero/i, "SPACE"],
  [/education|edtech|student/i, "EDU"],
  [/high.?school/i, "HIGH SCHOOL"],
];

export function parsePrizeValue(prize: string | undefined): number {
  if (!prize) return 0;
  const m = prize.replace(/,/g, "").match(/\$\s*([\d.]+)\s*([kKmM])?/);
  if (!m) return 0;
  const n = parseFloat(m[1] ?? "");
  if (Number.isNaN(n)) return 0;
  const mult = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2] ? 1_000 : 1;
  return n * mult;
}

export function daysUntilDeadline(deadline: string, today: Date): number {
  const d = new Date(`${deadline}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function deriveState(raw: RawListing, daysLeft: number | null): HackState {
  if (raw.state === "opens_soon") return "opens_soon";
  if (raw.state === "closed" || raw.active === false) return "closed";
  if (daysLeft !== null) {
    if (daysLeft < 0) return "closed";
    if (daysLeft <= 7) return "closing_soon";
  }
  return "open";
}

/** Site style: no em dashes anywhere on the website, including data fields. */
function noEmDash(s: string): string {
  return s.replace(/\s*—\s*/g, " - ").trim();
}

export function splitTitle(title: string): { title: string; tagline: string | null } {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m && (m[1] ?? "").length >= 6) {
    return { title: (m[1] ?? "").trim(), tagline: (m[2] ?? "").trim() };
  }
  return { title: title.trim(), tagline: null };
}

export function themesFor(text: string): string[] {
  const out: string[] = [];
  for (const [re, tag] of THEME_RULES) {
    if (re.test(text) && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 3);
}

export function loadHackathons(): Hackathon[] {
  let contents: string;
  try {
    contents = fs.readFileSync(LISTINGS_PATH, "utf8");
  } catch (err) {
    // A read failure means the data file isn't available to this runtime (e.g.
    // missing from the serverless bundle). Re-throw instead of returning [] —
    // under ISR an empty render would be committed to the cache and blank the
    // site. Throwing makes Next discard the regeneration and keep the last-good
    // page (and fails the build loudly if the file is genuinely absent).
    console.error(`[listings] could not read ${LISTINGS_PATH}:`, err);
    throw err;
  }

  let raw: RawListing[];
  try {
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error("listings.json did not parse to an array");
    }
    raw = parsed;
  } catch (err) {
    // File was readable but its contents are empty/malformed - a genuine data
    // problem, not a bundling issue. Degrade to an empty site.
    console.error(`[listings] could not parse ${LISTINGS_PATH}:`, err);
    return [];
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Deterministic jitter so co-located markers don't stack exactly.
  const seen: Record<string, number> = {};

  return raw
    .filter((r) => r.is_visible !== false)
    .map((r) => {
      const location = r.locations?.[0] ?? "TBA";
      let daysLeft: number | null = null;
      if (r.deadline) {
        daysLeft = daysUntilDeadline(r.deadline, today);
      }
      const { title, tagline } = splitTitle(r.title);

      let lat: number | null = null;
      let lng: number | null = null;
      const geo = GEO[location];
      if (geo && r.format !== "Virtual") {
        const n = (seen[location] = (seen[location] ?? 0) + 1);
        // spiral jitter ~0.08° per twin so stacked cities stay clickable
        const angle = n * 2.4;
        lat = geo[0] + (n > 1 ? 0.08 * Math.sin(angle) : 0);
        lng = geo[1] + (n > 1 ? 0.08 * Math.cos(angle) : 0);
      }

      const format =
        r.format === "Virtual" ? "Virtual" : r.format === "Hybrid" ? "Hybrid" : "In-Person";

      return {
        id: r.id,
        host: noEmDash(r.company_name),
        title: noEmDash(title),
        tagline: tagline ? noEmDash(tagline) : null,
        url: r.url,
        location: noEmDash(location),
        format,
        prize: r.prize ? noEmDash(r.prize) : null,
        prizeValue: parsePrizeValue(r.prize),
        state: deriveState(r, daysLeft),
        deadline: r.deadline ?? null,
        daysLeft,
        lat,
        lng,
        themes: themesFor(r.title + " " + r.company_name),
        postedAt: r.date_posted ?? 0,
      } satisfies Hackathon;
    })
    .sort((a, b) => {
      const order: Record<HackState, number> = {
        closing_soon: 0,
        open: 1,
        opens_soon: 2,
        closed: 3,
      };
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
    });
}

export function siteStats(list: Hackathon[]): SiteStats {
  const live = list.filter((h) => h.state !== "closed");
  const prizeTotal = list.reduce((s, h) => s + h.prizeValue, 0);
  const prizeDisplay =
    prizeTotal >= 1_000_000
      ? `$${(prizeTotal / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`
      : `$${Math.round(prizeTotal / 1000)}K+`;
  return {
    total: list.length,
    open: live.filter((h) => h.state === "open" || h.state === "closing_soon").length,
    closingSoon: list.filter((h) => h.state === "closing_soon").length,
    prizeDisplay,
    cities: new Set(list.filter((h) => h.lat !== null).map((h) => h.location)).size,
  };
}
