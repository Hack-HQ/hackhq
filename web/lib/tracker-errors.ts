/* ---------------------------------------------------------------------------
   Classifying tracker database failures, so a missing migration stops looking
   like a generic outage.

   `20260810064325_atomic_tracker_upsert.sql` has to be applied by hand (this
   project has no Supabase CLI or MCP wired up), and until it is, every
   PUT /api/tracker fails. Before this module the failure arrived as
   `new Error(error.message)` and left the route as an opaque
   500 `{"error":"Tracker sync failed"}` with the real cause - PostgREST's
   PGRST202, "function public.upsert_tracker_row does not exist" - visible only
   in a server log nobody was reading. #254 tracks the wider drift between the
   committed migrations and the live schema; this is the part that makes the
   drift observable from the outside.

   Two rules follow from that:

   1. The PostgREST/Postgres code has to survive the throw. `error.message`
      alone cannot be classified after the fact without matching on prose.
   2. Schema drift is not a 500. The database is reachable and the request was
      valid; the deployment is missing a migration, which is an "unavailable,
      try later" condition and an operator's problem. It answers 503 with a
      stable machine-readable code, so a client can tell "come back later" from
      "your request was wrong" without parsing English.

   What deliberately does NOT cross the wire: the Postgres code, the constraint
   or column names, and the driver's message. Supabase errors name schema
   objects, which is not something to hand to an anonymous caller. The stable
   code is a fixed vocabulary of our own, so it discloses nothing.
--------------------------------------------------------------------------- */

/** Wire vocabulary. Stable across releases: clients may branch on these. */
export const TRACKER_BACKEND_UNAVAILABLE = "TRACKER_BACKEND_UNAVAILABLE";
export const TRACKER_SYNC_FAILED = "TRACKER_SYNC_FAILED";

/**
 * The codes that mean "the live schema is not the schema this code was written
 * against", rather than "the query was wrong" or "the row was rejected".
 *
 * PGRST202/PGRST205 are PostgREST's own: the function or table is absent from
 * its schema cache, which is exactly the unapplied-migration case. The 42xxx
 * codes are Postgres proper, and cover the same drift reached by a path that
 * bypasses the cache.
 *
 * `42501` is deliberately absent, and now has two sources, both of which must
 * stay a 500 rather than a "come back later": a column grant that is wrong (RLS
 * work can cause that), and `public.force_tracker_owner` refusing a `user_id`
 * that does not match the caller's JWT subject
 * (`supabase/migrations/20260818013000`). The second is an attack or a client
 * bug, so it must be loud in Sentry and must never look transient.
 */
export const BACKEND_UNAVAILABLE_CODES: Record<string, true> = {
  PGRST202: true, // function not found in schema cache
  PGRST205: true, // table not found in schema cache
  "42883": true, // undefined_function
  "42P01": true, // undefined_table
  "42703": true, // undefined_column
};

/**
 * A store failure that remembers where it came from. `code` is whatever the
 * driver reported, kept verbatim so classification never has to parse prose;
 * `operation` is the store call, used as the Sentry tag and the log prefix.
 */
export class TrackerStoreError extends Error {
  readonly code?: string;
  readonly operation: string;

  constructor(operation: string, message: string, code?: string) {
    super(message);
    this.name = "TrackerStoreError";
    this.operation = operation;
    this.code = code;
  }
}

/**
 * Wrap a Supabase/PostgREST error object. Its shape is `{ message, code? }` in
 * practice, but it arrives untyped from the driver, so read it defensively -
 * a thrown error that loses its own message is worse than the original bug.
 */
export function trackerStoreError(
  operation: string,
  error: unknown,
): TrackerStoreError {
  const source = (error ?? {}) as { message?: unknown; code?: unknown };
  const message =
    typeof source.message === "string" && source.message.length > 0
      ? source.message
      : "Unknown database error";
  const code = typeof source.code === "string" ? source.code : undefined;
  return new TrackerStoreError(operation, message, code);
}

/** True when the failure means "this deployment is missing a migration". */
export function isBackendUnavailable(error: unknown): boolean {
  const code = error instanceof TrackerStoreError ? error.code : undefined;
  return code !== undefined && BACKEND_UNAVAILABLE_CODES[code] === true;
}

/**
 * The HTTP answer for a failed store call: status plus the exact body the route
 * serialises. Pure and dependency-free on purpose - the route needs
 * next/server and Clerk to be importable, this needs neither, so the mapping
 * that decides what a caller sees is unit-testable on its own.
 */
export function trackerFailureResponse(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (isBackendUnavailable(error)) {
    return {
      status: 503,
      body: {
        error: "Tracker sync is unavailable",
        code: TRACKER_BACKEND_UNAVAILABLE,
      },
    };
  }
  return {
    status: 500,
    body: { error: "Tracker sync failed", code: TRACKER_SYNC_FAILED },
  };
}
