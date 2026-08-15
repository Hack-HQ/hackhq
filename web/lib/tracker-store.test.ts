/* ---------------------------------------------------------------------------
   tracker-store talks to the database in one of two modes, and these tests pin
   the guarantees of both.

   SERVICE MODE uses the service-role key, which bypasses RLS, so row ownership
   is enforced here in code: every read, update and delete must be filtered by
   the caller's user_id, and every write must stamp that same user_id onto the
   row. A regression that dropped one of those filters would leak or overwrite
   another user's tracker, and RLS would not catch it.

   TOKEN MODE sends the caller's Clerk JWT with every request, so Postgres RLS
   is the enforcement point. The tests pin the wiring that makes that true: the
   anon key (not the service key) reaches createClient, the accessToken
   callback resolves the "supabase" Clerk template, and a missing token is a
   hard error rather than a silent fall back to the service role. The user_id
   filters must survive in this mode too - belt and braces, and the safety net
   if a deployment is ever flipped back.

   The Supabase client is mocked with a chainable builder that records the
   calls made against it, so the assertions are about *which filters were
   applied*, not about a live database. createClient itself records its
   arguments so each mode's credentials and options can be asserted. The store
   caches its client per module instance, so every test imports a fresh copy
   via loadStore() after arranging the environment.
--------------------------------------------------------------------------- */

import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a React Server Component; in the
// test runner it has nothing to guard, so stub it out.
vi.mock("server-only", () => ({}));

// The caller's Clerk session, controllable per test. auth() is what the store
// uses to resolve the current request's token in token mode.
let clerkToken: string | null = "clerk-jwt";
// The implementation takes no parameters, but vi.fn still records the
// arguments each call passes, which is what the template assertions read.
const getToken = vi.fn(async () => clerkToken);
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ getToken }),
}));

type Call = [string, ...unknown[]];
const calls: Call[] = [];

// Result the awaited (non-maybeSingle) chain resolves to. Reads want `data`,
// writes only read `error`; a shape carrying both serves either.
let chainResult: { data: unknown; error: unknown } = { data: [], error: null };
// Result the `.maybeSingle()` read inside an upsert resolves to.
let singleResult: { data: unknown; error: unknown } = { data: null, error: null };
// Result `.rpc()` resolves to. The atomic upsert function `returns table`, so a
// real client hands back a one-row array.
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };

const builder: Record<string, unknown> = {
  from: (t: string) => (calls.push(["from", t]), builder),
  select: (s: string) => (calls.push(["select", s]), builder),
  eq: (col: string, val: unknown) => (calls.push(["eq", col, val]), builder),
  upsert: (payload: unknown, opts: unknown) => (
    calls.push(["upsert", payload, opts]), builder
  ),
  delete: () => (calls.push(["delete"]), builder),
  rpc: (fn: string, args: unknown) => (
    calls.push(["rpc", fn, args]), Promise.resolve(rpcResult)
  ),
  maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(singleResult)),
  // Makes the builder awaitable: `await client.from(...).select(...).eq(...)`.
  then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(chainResult).then(onFulfilled, onRejected),
};

type ClientOptions = {
  accessToken?: () => Promise<string>;
  auth?: Record<string, unknown>;
};
const createClientCalls: Array<{
  url: string;
  key: string;
  options: ClientOptions;
}> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: ClientOptions) => {
    createClientCalls.push({ url, key, options });
    return builder;
  },
}));

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

const URL = "https://example.supabase.co";
const SERVICE_ENV = {
  SUPABASE_URL: URL,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const TOKEN_ENV = {
  SUPABASE_URL: URL,
  SUPABASE_ANON_KEY: "anon-key",
};

type Store = typeof import("./tracker-store");

/**
 * The store picks its mode when the client singleton is first built, so every
 * test arranges the environment and then imports a fresh module instance.
 */
async function loadStore(env: Partial<Record<string, string>>): Promise<Store> {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  return import("./tracker-store");
}

/** The createClient invocation the store made (it makes exactly one). */
function clientArgs(): { url: string; key: string; options: ClientOptions } {
  expect(createClientCalls).toHaveLength(1);
  const first = createClientCalls[0];
  if (!first) throw new Error("createClient was never called");
  return first;
}

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

function lastRpc(): { fn: unknown; args: unknown } | undefined {
  const c = [...calls].reverse().find((c) => c[0] === "rpc");
  return c ? { fn: c[1], args: c[2] } : undefined;
}

beforeEach(() => {
  calls.length = 0;
  createClientCalls.length = 0;
  clerkToken = "clerk-jwt";
  getToken.mockClear();
  chainResult = { data: [], error: null };
  singleResult = { data: null, error: null };
  // Reset too, or the error case below leaks into whichever test runs next.
  rpcResult = { data: [], error: null };
});

describe("client construction", () => {
  it("token mode: authenticates with the anon key and a per-request accessToken", async () => {
    const store = await loadStore(TOKEN_ENV);
    await store.listTracker(USER);

    const { url, key, options } = clientArgs();
    expect(url).toBe(URL);
    expect(key).toBe("anon-key");
    expect(typeof options.accessToken).toBe("function");
    // Server-side per-request client: the browser auth machinery stays off.
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
    });
  });

  it("token mode: the accessToken callback resolves the caller's supabase-template Clerk JWT", async () => {
    const store = await loadStore(TOKEN_ENV);
    await store.listTracker(USER);

    const { options } = clientArgs();
    await expect(options.accessToken!()).resolves.toBe("clerk-jwt");
    // The template is what carries {"role":"authenticated"}; the raw session
    // token would not satisfy the RLS policies' role grant.
    expect(getToken).toHaveBeenCalledWith({ template: "supabase" });
  });

  it("token mode: a missing Clerk token is a hard error, never a service-role fallback", async () => {
    const store = await loadStore(TOKEN_ENV);
    await store.listTracker(USER);

    clerkToken = null;
    const { options } = clientArgs();
    // Naming the misconfiguration matters: this fires when the Clerk JWT
    // template is missing or a signed-out code path reached the store.
    await expect(options.accessToken!()).rejects.toThrow(/JWT template/);
    await expect(options.accessToken!()).rejects.toThrow(
      /Refusing to fall back to the service role/,
    );
  });

  it("token mode wins when both keys are set, so setting the anon key is the whole flip", async () => {
    const store = await loadStore({ ...SERVICE_ENV, ...TOKEN_ENV });
    await store.listTracker(USER);

    const { key, options } = clientArgs();
    expect(key).toBe("anon-key");
    expect(typeof options.accessToken).toBe("function");
  });

  it("service mode: authenticates with the service role key and no accessToken", async () => {
    const store = await loadStore(SERVICE_ENV);
    await store.listTracker(USER);

    const { url, key, options } = clientArgs();
    expect(url).toBe(URL);
    expect(key).toBe("service-role-key");
    expect(options.accessToken).toBeUndefined();
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
    });
    // Service mode never consults Clerk; the route handler already did.
    expect(getToken).not.toHaveBeenCalled();
  });

  it("throws when neither key (or no URL) is configured", async () => {
    const store = await loadStore({});
    await expect(store.listTracker(USER)).rejects.toThrow(
      "Supabase is not configured for tracker sync",
    );
    expect(createClientCalls).toHaveLength(0);
  });
});

/**
 * The four operations must behave identically in both modes: in service mode
 * the user_id scoping is the entire ownership guarantee, in token mode it is
 * the belt-and-braces layer under RLS. Running the same suite against each
 * mode pins that neither can drop a filter without a test noticing.
 */
function describeStoreOperations(
  mode: string,
  env: Partial<Record<string, string>>,
) {
  describe(`listTracker (${mode})`, () => {
    it("reads user_hackathons scoped to the caller and never another user", async () => {
      const store = await loadStore(env);
      chainResult = {
        data: [{ hackathon_id: ID_A, stage: "going", is_win: true }],
        error: null,
      };

      const entries = await store.listTracker(USER);

      expect(calls).toContainEqual(["from", "user_hackathons"]);
      expect(eqFilters("user_id")).toEqual([USER]);
      expect(eqFilters("user_id")).not.toContain(OTHER);
      expect(entries).toEqual([{ hackathonId: ID_A, stage: "going", isWin: true }]);
    });

    it("surfaces a database error rather than returning partial data", async () => {
      const store = await loadStore(env);
      chainResult = { data: null, error: { message: "boom" } };
      await expect(store.listTracker(USER)).rejects.toThrow("boom");
    });
  });

  describe(`upsertTrackerRow (${mode})`, () => {
    it("stamps the caller's user_id on the write and never another user's", async () => {
      const store = await loadStore(env);
      rpcResult = { data: [{ stage: "applied", is_win: false }], error: null };

      const entry = await store.upsertTrackerRow(USER, ID_A, { stage: "applied" });

      // The row is written for the caller resolved from the Clerk session — a
      // client request body has no way to reach p_user_id.
      const call = lastRpc();
      expect(call?.fn).toBe("upsert_tracker_row");
      expect(call?.args).toMatchObject({ p_user_id: USER, p_hackathon_id: ID_A });
      expect(call?.args).not.toMatchObject({ p_user_id: OTHER });
      expect(entry).toEqual({ hackathonId: ID_A, stage: "applied", isWin: false });
    });

    it("does the partial merge in one statement instead of reading first", async () => {
      // The guarantee this protects: a concurrent PUT must not be able to
      // observe a half-applied update. Reading the row and merging in JS left
      // a window where two requests read the same snapshot and the second
      // clobbered the first, so there must be no pre-read at all.
      const store = await loadStore(env);
      rpcResult = { data: [{ stage: "going", is_win: false }], error: null };

      await store.upsertTrackerRow(USER, ID_A, { isWin: false });

      expect(calls.some((c) => c[0] === "maybeSingle")).toBe(false);
      expect(calls.some((c) => c[0] === "upsert")).toBe(false);
      expect(lastRpc()?.fn).toBe("upsert_tracker_row");
    });

    it("sends null for an omitted field so the database keeps the stored value", async () => {
      const store = await loadStore(env);
      rpcResult = { data: [{ stage: "going", is_win: false }], error: null };

      const entry = await store.upsertTrackerRow(USER, ID_A, { isWin: false });

      // null, not a default: "leave stage alone" has to be distinguishable from
      // "set stage to interested", or recording a win would reset the pipeline.
      expect(lastRpc()?.args).toMatchObject({ p_stage: null, p_is_win: false });
      // The row the function returns is what the caller gets back, not the patch.
      expect(entry).toEqual({ hackathonId: ID_A, stage: "going", isWin: false });
    });

    it("surfaces a database error rather than reporting a write that did not land", async () => {
      const store = await loadStore(env);
      rpcResult = { data: null, error: { message: "deadlock detected" } };

      await expect(
        store.upsertTrackerRow(USER, ID_A, { stage: "applied" }),
      ).rejects.toThrow("deadlock detected");
    });
  });

  describe(`deleteTrackerRow (${mode})`, () => {
    it("deletes only the caller's row for one hackathon", async () => {
      const store = await loadStore(env);
      await store.deleteTrackerRow(USER, ID_A);

      expect(calls).toContainEqual(["delete"]);
      expect(eqFilters("user_id")).toEqual([USER]);
      expect(eqFilters("hackathon_id")).toEqual([ID_A]);
    });
  });

  describe(`importTrackerRows (${mode})`, () => {
    it("stamps the caller's user_id on every imported row and stays additive", async () => {
      const store = await loadStore(env);
      await store.importTrackerRows(USER, [
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
      const store = await loadStore(env);
      await store.importTrackerRows(USER, []);
      expect(calls).toEqual([]);
    });
  });
}

describeStoreOperations("service mode", SERVICE_ENV);
describeStoreOperations("token mode", TOKEN_ENV);
