import fs from "node:fs";
import path from "node:path";

/**
 * Reads the repo's source-of-truth listings.json directly (no README
 * re-parsing) and enriches each record for the frontend:
 *  - derived status (open / opens_soon / closing_soon / closed) from deadline
 *  - lat/lng from a static geocode table (one entry per unique location)
 *  - days-until-deadline, cleaned titles, theme tags, prize parsing
 */

import { coordsForListing, isUnmappable, normalizeLocation } from "./geo";
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
  // Closed wins over every other signal — including opens_soon. A listing that
  // was explicitly closed (state="closed", or active=false) must never render as
  // OPENS SOON. This ordering mirrors util.resolve_state, which the README
  // generator uses; if the two disagree, the same listing shows a different
  // status on the site than in the README.
  if (raw.state === "closed" || raw.active === false) return "closed";
  if (raw.state === "opens_soon") return "opens_soon";
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

  // Locations we could not place, keyed by their normalized form so one city
  // spelled two ways is reported once. Collected while mapping and reported
  // below — a listing dropping off the globe should never be silent (#111).
  const unplaceable = new Map<string, string>();

  const hackathons = raw
    .filter((r) => r.is_visible !== false)
    .map((r) => {
      // `||`, not `??`: a listing with locations: [""] has a location that is
      // present but empty, and an empty string is no more mappable than a
      // missing one. `??` would let it through and report a blank name.
      const location = r.locations?.[0]?.trim() || "TBA";
      let daysLeft: number | null = null;
      if (r.deadline) {
        daysLeft = daysUntilDeadline(r.deadline, today);
      }
      const { title, tagline } = splitTitle(r.title);

      let lat: number | null = null;
      let lng: number | null = null;
      const geo = coordsForListing(location, r.format);
      if (geo) {
        // Count co-located listings by the *normalized* key. Keying this on the
        // raw string would restart the count for every spelling ("Toronto, ON"
        // vs "Toronto, ON, Canada"), so two listings now sharing one set of
        // coordinates would both take the n=1 zero-offset and stack exactly.
        const key = normalizeLocation(location);
        const n = (seen[key] = (seen[key] ?? 0) + 1);
        // Spiral-offset co-located markers just enough to stay individually
        // clickable when zoomed into a city. Keep this SMALL: 0.01° is ~1.1km,
        // which separates pins at city zoom while keeping every marker inside
        // the right city. (This was 0.08° ≈ 9km, which flung a Cambridge pin
        // clear across town into Roslindale.)
        const angle = n * 2.4;
        lat = geo[0] + (n > 1 ? 0.01 * Math.sin(angle) : 0);
        lng = geo[1] + (n > 1 ? 0.01 * Math.cos(angle) : 0);
      } else if (r.format !== "Virtual" && !isUnmappable(location)) {
        // Dedupe on the normalized key, not the raw string: otherwise
        // "Atlantis, XX" and "atlantis, xx" are reported as two missing places.
        const key = normalizeLocation(location);
        if (!unplaceable.has(key)) unplaceable.set(key, location);
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

  if (unplaceable.size > 0) {
    console.warn(
      `[listings] ${unplaceable.size} location(s) have no coordinates and will ` +
        `not appear on the globe: ${[...unplaceable.values()].join(", ")}. ` +
        `Add them to GEO in lib/geo.ts.`,
    );
  }

  return hackathons;
}

export function siteStats(list: Hackathon[]): SiteStats {
  const live = list.filter((h) => h.state !== "closed");
  const prizeTotal = list.reduce((s, h) => s + h.prizeValue, 0);
  const prizeDisplay =
    prizeTotal >= 1_000_000
      ? `$${(prizeTotal / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`
      : prizeTotal >= 1_000
        ? `$${Math.floor(prizeTotal / 1000)}K+`
        : prizeTotal > 0
          ? `$${prizeTotal.toLocaleString("en-US")}+`
          : "$0+";
  return {
    total: list.length,
    open: live.filter((h) => h.state === "open" || h.state === "closing_soon").length,
    closingSoon: list.filter((h) => h.state === "closing_soon").length,
    prizeDisplay,
    // Count distinct *places*, not distinct strings. "Toronto, ON, Canada" and
    // "Toronto, ON" are both in the data and both land on the same pin, so the
    // raw-string version of this counted Toronto twice and the site advertised
    // one more city than it shows.
    cities: new Set(
      list
        .filter((h) => h.lat !== null)
        .map((h) => normalizeLocation(h.location)),
    ).size,
  };
}
