/* ---------------------------------------------------------------------------
   The tracker vocabulary, shared by the browser and the server.

   Stages used to be declared in components/hq/store.tsx, which carries
   "use client". Now that /api/tracker validates the same values, they live here
   instead: a plain module both sides can import, with no client boundary and no
   second copy of the stage list to keep in step. store.tsx re-exports `Stage`
   and `STAGES` so existing importers are unaffected.

   Everything here is pure, so the parsing that guards both untrusted request
   bodies and untrusted localStorage is unit tested directly (tracker.test.ts).
--------------------------------------------------------------------------- */

export type Stage = "interested" | "applied" | "accepted" | "going";

export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "interested", label: "Interested", color: "#17b26a" },
  { id: "applied", label: "Applied", color: "#f5a623" },
  { id: "accepted", label: "Accepted", color: "#3b6bf0" },
  { id: "going", label: "Going", color: "#ed5b29" },
];

const STAGE_IDS = new Set<string>(STAGES.map((s) => s.id));

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && STAGE_IDS.has(value);
}

/** hackathon id -> pipeline stage. */
export type TrackerMap = Record<string, Stage>;

/** hackathon id -> won it. Only `true` entries are kept. */
export type WinMap = Record<string, boolean>;

/** One tracker row, as it crosses the wire and as it sits in the database. */
export type TrackerEntry = {
  hackathonId: string;
  stage: Stage;
  isWin: boolean;
};

/**
 * Listing ids are UUIDs, both in listings.json and in the `hackathon_id` column.
 * Checked before any query so a malformed id is a 400 here rather than a
 * Postgres cast error surfacing as a 500.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHackathonId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Coerce an untrusted value into a clean TrackerMap: keep only string ids
 * mapped to a known Stage, drop everything else. Guards against a
 * valid-JSON-but-wrong-shape payload being cast blindly.
 */
export function sanitizeTrackerMap(value: unknown): TrackerMap {
  if (!value || typeof value !== "object") return {};
  const out: TrackerMap = {};
  for (const [id, stage] of Object.entries(value as Record<string, unknown>)) {
    if (isStage(stage)) out[id] = stage;
  }
  return out;
}

/** The same guard for the win map. Anything not exactly `true` is dropped. */
export function sanitizeWinMap(value: unknown): WinMap {
  if (!value || typeof value !== "object") return {};
  const out: WinMap = {};
  for (const [id, won] of Object.entries(value as Record<string, unknown>)) {
    if (won === true) out[id] = true;
  }
  return out;
}

/**
 * Parse a list of entries from an untrusted source — an API response, or the
 * import payload a browser sends when handing its local tracker over. Rows that
 * don't validate are dropped rather than failing the batch: one bad id should
 * not cost a user the rest of their pipeline.
 */
export function parseTrackerEntries(value: unknown): TrackerEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TrackerEntry[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const { hackathonId, stage, isWin } = row as Record<string, unknown>;
    if (!isHackathonId(hackathonId) || !isStage(stage)) continue;
    if (seen.has(hackathonId)) continue;
    seen.add(hackathonId);
    out.push({ hackathonId, stage, isWin: isWin === true });
  }
  return out;
}

/** Entries -> the two maps the UI renders from. */
export function splitEntries(entries: TrackerEntry[]): {
  tracked: TrackerMap;
  wins: WinMap;
} {
  const tracked: TrackerMap = {};
  const wins: WinMap = {};
  for (const e of entries) {
    tracked[e.hackathonId] = e.stage;
    if (e.isWin) wins[e.hackathonId] = true;
  }
  return { tracked, wins };
}

/**
 * The two maps -> entries, for the one-time handover of a browser-local tracker.
 * Only ids the caller can still see are sent; a stale id from a delisted
 * hackathon is not worth carrying into the database.
 */
export function toTrackerEntries(
  tracked: TrackerMap,
  wins: WinMap,
  knownIds?: Iterable<string>,
): TrackerEntry[] {
  const known = knownIds ? new Set(knownIds) : null;
  return Object.entries(tracked)
    .filter(([id]) => isHackathonId(id) && (!known || known.has(id)))
    .map(([hackathonId, stage]) => ({
      hackathonId,
      stage,
      isWin: wins[hackathonId] === true,
    }));
}
