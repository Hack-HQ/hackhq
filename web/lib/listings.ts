/**
 * Reads the repo's source-of-truth listings.json (no README re-parsing) and
 * enriches each record for the frontend:
 *  - derived status (open / opens_soon / closing_soon / closed) from deadline
 *  - lat/lng from a static geocode table (one entry per unique location)
 *  - days-until-deadline, cleaned titles, theme tags, prize parsing
 *
 * The listings file is copied into lib/generated/listings.json at build time
 * (scripts/prepare-repo-data.mjs) and imported here, so no disk read happens at
 * request time — it deploys unchanged to Cloudflare Workers or Node.
 */

import listingsData from "./generated/listings.json";
import { coordsForListing, isUnmappable, normalizeLocation } from "./geo";
import type { HackState, Hackathon, SiteStats } from "./types-hq";

export type { HackState, Hackathon, SiteStats };

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
  startDate?: string;
  endDate?: string;
  featured?: boolean;
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

// How many days out still counts as CLOSING SOON. Keep this in sync with
// CLOSING_SOON_DAYS in .github/scripts/util.py, which derives the same badge for
// the README — if the two windows disagree, the same listing shows a different
// status on the site than in the list.
export const CLOSING_SOON_DAYS = 14;

export function daysUntilDeadline(deadline: string, today: Date): number {
  const d = new Date(`${deadline}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Days until the date a listing has to be acted on, or null when it has none.
 *
 * An application deadline wins when one exists — it is the date you must
 * register by. With no deadline recorded, the event itself is the thing to act
 * on: its start date while still upcoming, or its end date once it is already
 * running (a hackathon you can still join for three more days is exactly what a
 * closing-soon badge is for).
 *
 * Mirrors util.urgency_date in .github/scripts/util.py.
 */
export function daysUntilAction(raw: RawListing, today: Date): number | null {
  if (raw.deadline) return daysUntilDeadline(raw.deadline, today);
  for (const value of [raw.startDate, raw.endDate]) {
    if (!value) continue;
    const days = daysUntilDeadline(value, today);
    if (days >= 0) return days;
  }
  return null;
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
    if (daysLeft <= CLOSING_SOON_DAYS) return "closing_soon";
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

/**
 * Memo for loadHackathons, keyed by the current date.
 *
 * Every listing's state, badge and countdown is derived from `today`, so the
 * result is only reusable within the same day - the key is what keeps a
 * long-lived isolate from serving yesterday's "3 days left". Within one day the
 * work is pure and identical, and it is not cheap: 185 listings x 12 theme
 * regexes, plus geocoding, title splitting and prize parsing on each.
 *
 * This matters because /my is `force-dynamic` (it calls auth()), so it re-ran
 * all of it on every single request. That is CPU burned inside the Worker on
 * every authenticated page view - the thing that put us over the limit in #299.
 *
 * Safe to share: no caller mutates the array. Every call site that sorts does
 * so on a fresh array from a .filter()/.map() chain (deck-order copies with
 * [...filtered] before sorting), and the client components work on serialized
 * props rather than this object.
 */
let hackathonsCache: { key: string; value: Hackathon[] } | null = null;

export function loadHackathons(): Hackathon[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cacheKey = today.toISOString().slice(0, 10);
  if (hackathonsCache?.key === cacheKey) return hackathonsCache.value;

  // Imported as a compile-time constant, so it is always an array here; the
  // build fails loudly in prepare-repo-data.mjs if the source is malformed.
  const raw = listingsData as RawListing[];

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
      // Days until the listing has to be acted on — its deadline when it has
      // one, otherwise its own event dates. Driving the countdown, the badge and
      // the sort off one number keeps a card from reading "12 days left" while
      // its badge says something else.
      const daysLeft: number | null = daysUntilAction(r, today);
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
        startDate: r.startDate ?? null,
        endDate: r.endDate ?? null,
        daysLeft,
        lat,
        lng,
        themes: themesFor(r.title + " " + r.company_name),
        postedAt: r.date_posted ?? 0,
        featured: r.featured === true,
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

  hackathonsCache = { key: cacheKey, value: hackathons };
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
