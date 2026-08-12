/* ---------------------------------------------------------------------------
   Server-side reads and writes for public.user_hackathons.

   This is the app's first runtime database access — every other page reads
   listings.json off disk — so it is deliberately narrow: four operations, all
   scoped to one user, and no query in here takes a user id from a caller's
   request body. The id always comes from the Clerk session, resolved in the
   route handler.

   ## Why the service role, and what still guards the rows

   The client is built with the service role key, which bypasses RLS. Ownership
   is therefore enforced here, by the `.eq("user_id", userId)` on every read and
   delete, by writing `user_id` explicitly on every insert, and by passing it as
   `p_user_id` to the upsert function — which stamps it onto the row rather than
   taking the caller's word for it.

   The RLS policies in the migration are not redundant. They mean `anon` and
   `authenticated` cannot touch this table at all, so nothing reachable with a
   publishable key can read one user's tracker — and they are what a future
   browser-direct path would run under. The trade-off of the service role is
   that a missing filter in this file would not be caught by the database, which
   is why the surface is kept this small and why `userId` is a required
   parameter rather than an option on every function below.

   Upgrade path: Clerk's native Supabase integration lets the browser's own
   session token satisfy those policies directly, moving enforcement back into
   Postgres. That needs a trust relationship configured in both dashboards, so
   it is a follow-up rather than a prerequisite for shipping this.
--------------------------------------------------------------------------- */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Stage, TrackerEntry } from "./tracker";
import { parseTrackerEntries } from "./tracker";

const TABLE = "user_hackathons";

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured for tracker sync");
  }
  // No session persistence or refresh: this runs per request on the server and
  // authenticates with a static key, so the auth machinery has nothing to do.
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Every row belonging to one user, ready for the UI to split into its maps. */
export async function listTracker(userId: string): Promise<TrackerEntry[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select("hackathon_id, stage, is_win")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return parseTrackerEntries(
    (data ?? []).map((row) => ({
      hackathonId: row.hackathon_id,
      stage: row.stage,
      isWin: row.is_win,
    })),
  );
}

/**
 * Create or update one row. Partial by design: moving a hackathon between
 * stages must not clear its win, and recording a win must not reset its stage,
 * so an omitted field falls back to the stored value (or the column default on
 * a first insert) instead of being written as false.
 */
export async function upsertTrackerRow(
  userId: string,
  hackathonId: string,
  patch: { stage?: Stage; isWin?: boolean },
): Promise<TrackerEntry> {
  // One statement rather than read-merge-write. Reading the row here and
  // merging the patch in JS left a window where two concurrent PUTs for the
  // same (user, hackathon) both read the same snapshot and the second write
  // clobbered the first — losing exactly the field the other request was
  // preserving. public.upsert_tracker_row does the coalesce inside the same
  // ON CONFLICT DO UPDATE that writes, so there is nothing to interleave with.
  // A null argument means "leave that column at its stored value", which is how
  // an omitted patch field is expressed without a prior read.
  const { data, error } = await client().rpc("upsert_tracker_row", {
    p_user_id: userId,
    p_hackathon_id: hackathonId,
    p_stage: patch.stage ?? null,
    p_is_win: patch.isWin ?? null,
  });
  if (error) throw new Error(error.message);

  // `returns table (...)` arrives as a one-row array. Fall back to the patch if
  // a client ever hands back a bare object instead, so the caller still gets
  // the values it asked for rather than undefined.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { stage?: string; is_win?: boolean }
    | undefined;

  return {
    hackathonId,
    stage: (row?.stage as Stage) ?? patch.stage ?? "interested",
    isWin: row?.is_win ?? patch.isWin ?? false,
  };
}

export async function deleteTrackerRow(
  userId: string,
  hackathonId: string,
): Promise<void> {
  const { error } = await client()
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("hackathon_id", hackathonId);
  if (error) throw new Error(error.message);
}

/**
 * Hand a browser's local tracker over on first sign-in. `ignoreDuplicates`
 * makes this additive: an account that already tracks a hackathon keeps the
 * stage it has on the server, so signing in on a second device cannot roll the
 * pipeline back to whatever that browser happened to remember.
 */
export async function importTrackerRows(
  userId: string,
  entries: TrackerEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await client()
    .from(TABLE)
    .upsert(
      entries.map((e) => ({
        user_id: userId,
        hackathon_id: e.hackathonId,
        stage: e.stage,
        is_win: e.isWin,
      })),
      { onConflict: "user_id,hackathon_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}
