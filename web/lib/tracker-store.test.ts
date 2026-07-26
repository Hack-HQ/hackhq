/* ---------------------------------------------------------------------------
   tracker-store is the only place the app touches the database with the
   service-role key, which bypasses RLS. Row ownership is therefore enforced
   here in code rather than by Postgres, so these tests exist to make that
   guarantee load-bearing: every read, update and delete must be filtered by the
   caller's user_id, and every write must stamp that same user_id onto the row.
   A regression that dropped one of those filters would leak or overwrite another
   user's tracker, and RLS would not catch it.

   The Supabase client is mocked with a chainable builder that records the calls
   made against it, so the assertions are about *which filters were applied*, not
   about a live database.
--------------------------------------------------------------------------- */

import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a React Server Component; in the
// test runner it has nothing to guard, so stub it out.
vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
const calls: Call[] = [];

// Result the awaited (non-maybeSingle) chain resolves to. Reads want `data`,
// writes only read `error`; a shape carrying both serves either.
let chainResult: { data: unknown; error: unknown } = { data: [], error: null };
// Result the `.maybeSingle()` read inside an upsert resolves to.
let singleResult: { data: unknown; error: unknown } = { data: null, error: null };

const builder: Record<string, unknown> = {
  from: (t: string) => (calls.push(["from", t]), builder),
  select: (s: string) => (calls.push(["select", s]), builder),
  eq: (col: string, val: unknown) => (calls.push(["eq", col, val]), builder),
  upsert: (payload: unknown, opts: unknown) => (
    calls.push(["upsert", payload, opts]), builder
  ),
  delete: () => (calls.push(["delete"]), builder),
  maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(singleResult)),
  // Makes the builder awaitable: `await client.from(...).select(...).eq(...)`.
  then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(chainResult).then(onFulfilled, onRejected),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => builder,
}));

import {
  deleteTrackerRow,
  importTrackerRows,
  listTracker,
  upsertTrackerRow,
} from "./tracker-store";

const USER = "user_2abc";
const OTHER = "user_2xyz";
const ID_A = "57177cd1-cff8-4e80-b701-6811dbcdb1a4";
const ID_B = "4c7865aa-543e-4ac8-9f47-808da1bffddc";

/** Every ["eq", col, val] recorded against the builder for a given column. */
function eqFilters(col: string): unknown[] {
  return calls.filter((c) => c[0] === "eq" && c[1] === col).map((c) => c[2]);
}

function lastUpsert(): { payload: unknown; opts: unknown } | undefined {
  const c = [...calls].reverse().find((c) => c[0] === "upsert");
  return c ? { payload: c[1], opts: c[2] } : undefined;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  calls.length = 0;
  chainResult = { data: [], error: null };
  singleResult = { data: null, error: null };
});

describe("listTracker", () => {
  it("reads user_hackathons scoped to the caller and never another user", async () => {
    chainResult = {
      data: [{ hackathon_id: ID_A, stage: "going", is_win: true }],
      error: null,
    };

    const entries = await listTracker(USER);

    expect(calls).toContainEqual(["from", "user_hackathons"]);
    expect(eqFilters("user_id")).toEqual([USER]);
    expect(eqFilters("user_id")).not.toContain(OTHER);
    expect(entries).toEqual([{ hackathonId: ID_A, stage: "going", isWin: true }]);
  });

  it("surfaces a database error rather than returning partial data", async () => {
    chainResult = { data: null, error: { message: "boom" } };
    await expect(listTracker(USER)).rejects.toThrow("boom");
  });
});

describe("upsertTrackerRow", () => {
  it("scopes the pre-read by user_id AND hackathon_id and stamps user_id on the write", async () => {
    const entry = await upsertTrackerRow(USER, ID_A, { stage: "applied" });

    // The existence read is scoped to this user's row for this hackathon only.
    expect(eqFilters("user_id")).toEqual([USER]);
    expect(eqFilters("hackathon_id")).toEqual([ID_A]);

    // The written row carries the caller's id — a client body can't set it.
    const up = lastUpsert();
    expect(up?.payload).toMatchObject({
      user_id: USER,
      hackathon_id: ID_A,
      stage: "applied",
      is_win: false,
    });
    expect(up?.opts).toMatchObject({ onConflict: "user_id,hackathon_id" });
    expect(entry).toEqual({ hackathonId: ID_A, stage: "applied", isWin: false });
  });

  it("preserves the stored stage/win when the patch omits them (partial update)", async () => {
    singleResult = { data: { stage: "going", is_win: true }, error: null };

    const entry = await upsertTrackerRow(USER, ID_A, { isWin: false });

    expect(entry).toEqual({ hackathonId: ID_A, stage: "going", isWin: false });
    expect(lastUpsert()?.payload).toMatchObject({
      user_id: USER,
      stage: "going",
      is_win: false,
    });
  });
});

describe("deleteTrackerRow", () => {
  it("deletes only the caller's row for one hackathon", async () => {
    await deleteTrackerRow(USER, ID_A);

    expect(calls).toContainEqual(["delete"]);
    expect(eqFilters("user_id")).toEqual([USER]);
    expect(eqFilters("hackathon_id")).toEqual([ID_A]);
  });
});

describe("importTrackerRows", () => {
  it("stamps the caller's user_id on every imported row and stays additive", async () => {
    await importTrackerRows(USER, [
      { hackathonId: ID_A, stage: "going", isWin: true },
      { hackathonId: ID_B, stage: "applied", isWin: false },
    ]);

    const up = lastUpsert();
    const rows = up?.payload as Array<{ user_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === USER)).toBe(true);
    // ignoreDuplicates keeps the server's existing stage on a second device.
    expect(up?.opts).toMatchObject({
      onConflict: "user_id,hackathon_id",
      ignoreDuplicates: true,
    });
  });

  it("makes no database call for an empty import", async () => {
    await importTrackerRows(USER, []);
    expect(calls).toEqual([]);
  });
});
