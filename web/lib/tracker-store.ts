/* ---------------------------------------------------------------------------
   Server-side reads and writes for public.user_hackathons.

   This is the app's first runtime database access - every other page reads
   listings.json off disk - so it is deliberately narrow: four operations, all
   scoped to one user, and no query in here takes a user id from a caller's
   request body. The id always comes from the Clerk session, resolved in the
   route handler.

   ## Two modes, two enforcement points

   TOKEN MODE (preferred) - active when SUPABASE_ANON_KEY is set. The client
   authenticates every request with the caller's own Clerk JWT (the "supabase"
   template), so queries run as the `authenticated` role and Postgres RLS is
   what enforces row ownership: the policies on user_hackathons compare
   `auth.jwt() ->> 'sub'` to user_id, and public.upsert_tracker_row is
   SECURITY INVOKER so the RPC inherits the same policies. A query that
   forgot its filter would return or touch nothing it should not - the
   database refuses, not this file.

   SERVICE MODE (legacy fallback) - active when only SUPABASE_SERVICE_ROLE_KEY
   is set. The service role bypasses RLS, so ownership is enforced here in the
   app layer instead: by the `.eq("user_id", userId)` on every read and delete,
   by writing user_id explicitly on every insert, and by passing it as
   p_user_id to the upsert function. This keeps production working until the
   external configuration for token mode (Clerk JWT template plus Supabase
   third-party auth) lands; see web/README.md for the flip procedure.

   The user_id filters and stamping stay in BOTH modes on purpose. In token
   mode they are belt and braces rather than load-bearing - RLS is the
   guarantee - but keeping them means a misconfigured deployment degrades to
   the service-mode guarantee instead of to nothing, and the queries document
   their own scope.
--------------------------------------------------------------------------- */

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Stage, TrackerEntry } from "./tracker";
import { parseTrackerEntries } from "./tracker";
import { requiresTrackerRls } from "./env";
import { trackerStoreError } from "./tracker-errors";

const TABLE = "user_hackathons";

/**
 * The caller's Clerk JWT for Supabase, fetched fresh per request. auth() reads
 * the request's async context, so even though the client below is a
 * module-level singleton, this resolves to whoever is making the CURRENT
 * request - never a token cached from an earlier one.
 *
 * A null token is a hard error, not a cue to fall back to the service role:
 * falling back would silently bypass RLS and defeat the reason token mode
 * exists. It means either the Clerk JWT template named "supabase" has not been
 * created, or a code path called the store without a signed-in user.
 */
async function clerkSupabaseToken(): Promise<string> {
  const { getToken } = await auth();
  const token = await getToken({ template: "supabase" });
  if (!token) {
    throw new Error(
      'Tracker sync is in token mode (SUPABASE_ANON_KEY is set) but Clerk returned no token for the "supabase" JWT template. ' +
        'Either create that template in the Clerk dashboard (with {"role":"authenticated"}) or this call happened without a signed-in user. ' +
        "Refusing to fall back to the service role key, which would bypass row level security.",
    );
  }
  return token;
}

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || (!anonKey && !serviceKey)) {
    throw new Error("Supabase is not configured for tracker sync");
  }
  // No session persistence or refresh in either mode: this runs per request on
  // the server, so the browser-oriented auth machinery has nothing to do. In
  // token mode supabase-js ignores these auth options entirely (the accessToken
  // option replaces its auth client), but passing them keeps the two branches
  // symmetric and harmless.
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  // Token mode wins when both keys are present, so setting SUPABASE_ANON_KEY is
  // sufficient to flip enforcement into Postgres; removing the service key can
  // follow once the flip is verified.
  if (!anonKey && requiresTrackerRls()) {
    // Fail closed rather than degrade. Reached only when someone has explicitly
    // asked for database-enforced ownership (SUPABASE_TRACKER_REQUIRE_RLS) and
    // the deployment cannot provide it, which means the flip is half-done: the
    // switch is on but SUPABASE_ANON_KEY is missing. Serving the request anyway
    // would quietly hand tenancy back to the app layer, which is the exact
    // thing the switch exists to rule out.
    throw new Error(
      "SUPABASE_TRACKER_REQUIRE_RLS is set, so tracker sync must run in token mode, " +
        "but SUPABASE_ANON_KEY is not configured - only the service role key is, and it " +
        "bypasses row level security. Set SUPABASE_ANON_KEY, or unset " +
        "SUPABASE_TRACKER_REQUIRE_RLS to accept app-layer enforcement (#235).",
    );
  }
  cached = anonKey
    ? createClient(url, anonKey, {
        ...options,
        // Runs on every request the client makes, inside the route handler's
        // async context, so the singleton client is still per-caller.
        accessToken: clerkSupabaseToken,
      })
    : createClient(url, serviceKey as string, options);
  return cached;
}

/** Every row belonging to one user, ready for the UI to split into its maps. */
export async function listTracker(userId: string): Promise<TrackerEntry[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select("hackathon_id, stage, is_win")
    .eq("user_id", userId);
  if (error) throw trackerStoreError("list", error);

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
  // clobbered the first - losing exactly the field the other request was
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
  if (error) throw trackerStoreError("upsert", error);

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
  if (error) throw trackerStoreError("delete", error);
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
  if (error) throw trackerStoreError("import", error);
}
