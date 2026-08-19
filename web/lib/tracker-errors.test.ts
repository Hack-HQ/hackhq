/* ---------------------------------------------------------------------------
   What a tracker failure looks like from outside the server.

   The behaviour under test is the one that was missing while
   `20260810064325_atomic_tracker_upsert.sql` sat unapplied: PostgREST answered
   PGRST202 ("function public.upsert_tracker_row does not exist"), the store
   flattened it to `new Error(error.message)`, and the route returned an opaque
   500. Nothing distinguished "this deployment is missing a migration" from "the
   database rejected the write", so the outage was invisible to every client and
   to alerting.

   These assertions pin three separate guarantees:

   1. The driver's code survives the throw, because classification after the
      fact must not depend on matching English prose.
   2. Schema drift maps to 503 and a stable code; everything else stays 500.
   3. The driver's message and code never reach the response body, because
      Supabase errors name schema objects.

   The mapping is tested here rather than through the route handler because
   `route.ts` imports via the `@/` alias, which this project's vitest setup does
   not resolve (there is no vitest config; every existing test uses relative
   imports). Keeping the mapping in a dependency-free module is what makes it
   assertable at all - see the note in tracker-errors.ts.
--------------------------------------------------------------------------- */

import { describe, expect, it } from "vitest";
import {
  BACKEND_UNAVAILABLE_CODES,
  TRACKER_BACKEND_UNAVAILABLE,
  TRACKER_SYNC_FAILED,
  TrackerStoreError,
  isBackendUnavailable,
  trackerFailureResponse,
  trackerStoreError,
} from "./tracker-errors";

/** The shape @supabase/supabase-js hands back on a failed call. */
const pgError = (message: string, code?: string) => ({ message, code });

describe("trackerStoreError", () => {
  it("keeps the driver's code so the failure can be classified later", () => {
    const error = trackerStoreError(
      "upsert",
      pgError(
        "Could not find the function public.upsert_tracker_row(...)",
        "PGRST202",
      ),
    );

    expect(error).toBeInstanceOf(TrackerStoreError);
    expect(error.code).toBe("PGRST202");
    expect(error.operation).toBe("upsert");
    // The message is preserved for the server-side log and for Sentry.
    expect(error.message).toContain("upsert_tracker_row");
  });

  it("survives an error object with no code", () => {
    const error = trackerStoreError("list", pgError("boom"));
    expect(error.code).toBeUndefined();
    expect(error.message).toBe("boom");
  });

  it("never loses its own message, even for a malformed driver error", () => {
    expect(trackerStoreError("delete", null).message).toBe(
      "Unknown database error",
    );
    expect(trackerStoreError("delete", { code: 500 }).message).toBe(
      "Unknown database error",
    );
  });
});

describe("isBackendUnavailable", () => {
  it("recognises every schema-drift code", () => {
    for (const code of Object.keys(BACKEND_UNAVAILABLE_CODES)) {
      expect(isBackendUnavailable(trackerStoreError("upsert", pgError("x", code))))
        .toBe(true);
    }
  });

  it("does not treat a real query fault as drift", () => {
    // 23505 unique_violation, 23514 check_violation, 40P01 deadlock: the
    // database is present and answering, so these must stay 500s.
    for (const code of ["23505", "23514", "40P01", "42501"]) {
      expect(
        isBackendUnavailable(trackerStoreError("upsert", pgError("x", code))),
      ).toBe(false);
    }
  });

  it("does not classify an untyped error as drift", () => {
    expect(isBackendUnavailable(new Error("PGRST202"))).toBe(false);
    expect(isBackendUnavailable(undefined)).toBe(false);
  });
});

describe("trackerFailureResponse", () => {
  it("answers 503 for an unapplied migration", () => {
    const { status, body } = trackerFailureResponse(
      trackerStoreError("upsert", pgError("no such function", "PGRST202")),
    );

    expect(status).toBe(503);
    expect(body.code).toBe(TRACKER_BACKEND_UNAVAILABLE);
  });

  it("answers 500 for anything else", () => {
    const { status, body } = trackerFailureResponse(
      trackerStoreError("upsert", pgError("deadlock detected", "40P01")),
    );

    expect(status).toBe(500);
    expect(body.code).toBe(TRACKER_SYNC_FAILED);
  });

  it("leaks neither the driver's message nor its code", () => {
    const secret =
      'null value in column "user_id" of relation "user_hackathons"';
    const { body } = trackerFailureResponse(
      trackerStoreError("import", pgError(secret, "23502")),
    );

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("user_hackathons");
    expect(serialised).not.toContain("user_id");
    expect(serialised).not.toContain("23502");
    // Exactly two keys, both from our own vocabulary.
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
  });

  it("keeps the synced:false contract untouched", () => {
    // resolveUser()'s 200 {synced:false} and its 401 are separate paths that
    // never reach this mapping; a failure always carries a code.
    const { body } = trackerFailureResponse(new Error("anything"));
    expect(body).not.toHaveProperty("synced");
  });
});
