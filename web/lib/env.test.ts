import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_TRACKER_REQUIRE_RLS",
] as const;

/**
 * validateEnv() warns only once per module instance, so each case re-imports a
 * fresh copy rather than sharing one.
 */
async function loadEnv(set: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, set);
  vi.resetModules();
  return import("./env");
}

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

const CLERK = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
  CLERK_SECRET_KEY: "sk_test",
};
const SUPABASE = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("isTrackerSyncConfigured", () => {
  it("is on only when Clerk and Supabase are both fully configured", async () => {
    const { isTrackerSyncConfigured } = await loadEnv({ ...CLERK, ...SUPABASE });
    expect(isTrackerSyncConfigured()).toBe(true);
  });

  it("is off without Supabase, so the tracker stays browser-local", async () => {
    const { isTrackerSyncConfigured } = await loadEnv(CLERK);
    expect(isTrackerSyncConfigured()).toBe(false);
  });

  it("is off without Clerk — there would be no user to attribute a row to", async () => {
    const { isTrackerSyncConfigured } = await loadEnv(SUPABASE);
    expect(isTrackerSyncConfigured()).toBe(false);
  });

  it("is off when only one Supabase value is set", async () => {
    const { isTrackerSyncConfigured } = await loadEnv({
      ...CLERK,
      SUPABASE_URL: SUPABASE.SUPABASE_URL,
    });
    expect(isTrackerSyncConfigured()).toBe(false);
  });

  it("is on with the anon key alone - token mode needs no service role key", async () => {
    const { isTrackerSyncConfigured } = await loadEnv({
      ...CLERK,
      SUPABASE_URL: SUPABASE.SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon-key",
    });
    expect(isTrackerSyncConfigured()).toBe(true);
  });
});

/**
 * Which enforcement model is live was previously unanswerable from outside the
 * process: SUPABASE_ANON_KEY decides it, the value is server-only, and nothing
 * reported the outcome. route.ts tags every tracker error in Sentry with this,
 * so the tag is only worth having if the function is right (#235).
 */
describe("trackerMode", () => {
  it("is 'token' when the anon key is set — RLS is the enforcement point", async () => {
    const { trackerMode } = await loadEnv({
      ...CLERK,
      ...SUPABASE,
      SUPABASE_ANON_KEY: "anon",
    });
    expect(trackerMode()).toBe("token");
  });

  it("is 'service' with only the service role key — ownership rests on app code", async () => {
    const { trackerMode } = await loadEnv({ ...CLERK, ...SUPABASE });
    expect(trackerMode()).toBe("service");
  });

  it("prefers token when both keys are set, matching tracker-store", async () => {
    const { trackerMode } = await loadEnv({
      ...CLERK,
      ...SUPABASE,
      SUPABASE_ANON_KEY: "anon",
    });
    expect(trackerMode()).toBe("token");
  });

  it("is 'off' when sync is not configured, so the tag never implies a database", async () => {
    const { trackerMode } = await loadEnv(CLERK);
    expect(trackerMode()).toBe("off");
  });

  it("is 'off' without Clerk even with both Supabase keys", async () => {
    // There would be no user to attribute a row to, so nothing is enforced
    // either way — reporting "service" here would overstate what is running.
    const { trackerMode } = await loadEnv({
      ...SUPABASE,
      SUPABASE_ANON_KEY: "anon",
    });
    expect(trackerMode()).toBe("off");
  });
});

describe("requiresTrackerRls", () => {
  it("is off unless explicitly set, so the switch cannot take a deploy down by default", async () => {
    const { requiresTrackerRls } = await loadEnv({ ...CLERK, ...SUPABASE });
    expect(requiresTrackerRls()).toBe(false);
  });

  it("accepts 1 and true in either case", async () => {
    for (const raw of ["1", "true", "TRUE", "True"]) {
      const { requiresTrackerRls } = await loadEnv({
        ...CLERK,
        ...SUPABASE,
        SUPABASE_TRACKER_REQUIRE_RLS: raw,
      });
      expect(requiresTrackerRls(), raw).toBe(true);
    }
  });

  it("ignores anything else rather than guessing", async () => {
    // A half-understood value must not silently arm a switch that refuses
    // traffic; "0"/"no"/"" all mean off.
    for (const raw of ["0", "no", "off", "yes", ""]) {
      const { requiresTrackerRls } = await loadEnv({
        ...CLERK,
        ...SUPABASE,
        SUPABASE_TRACKER_REQUIRE_RLS: raw,
      });
      expect(requiresTrackerRls(), raw).toBe(false);
    }
  });
});

describe("validateEnv", () => {
  it("reports a half-configured Supabase rather than failing quietly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await loadEnv({
      ...CLERK,
      SUPABASE_URL: SUPABASE.SUPABASE_URL,
    });

    expect(validateEnv().trackerSync).toBe("partial");
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("warns when Supabase is ready but Clerk is not, since sync still cannot run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await loadEnv(SUPABASE);
    const report = validateEnv();

    expect(report.trackerSync).toBe("enabled");
    expect(report.clerk).toBe("disabled");
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "Supabase is configured but Clerk is not",
    );
  });

  it("names the anon key when token mode is set up without Clerk", async () => {
    // Token mode's only credential is the caller's Clerk JWT, so this is a
    // sharper misconfiguration than the generic Supabase-without-Clerk case
    // and deserves a warning that says which variable caused it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await loadEnv({
      SUPABASE_URL: SUPABASE.SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon-key",
    });
    const report = validateEnv();

    expect(report.trackerSync).toBe("enabled");
    expect(report.trackerRls).toBe(true);
    const text = warn.mock.calls.flat().join(" ");
    expect(text).toContain("SUPABASE_ANON_KEY is set but Clerk");
    // The specific warning replaces the generic one, not stacks on top of it.
    expect(text).not.toContain("Supabase is configured but Clerk is not");
  });

  it("reports token mode in trackerRls when the anon key is present", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await loadEnv({
      ...CLERK,
      SUPABASE_URL: SUPABASE.SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_MAPBOX_TOKEN: "pk.mapbox",
    } as Record<string, string>);

    expect(validateEnv()).toEqual({
      mapbox: true,
      clerk: "enabled",
      trackerSync: "enabled",
      trackerRls: true,
      posthog: false,
    });
    // Token mode fully configured is the intended end state, not a warning.
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet about auth and sync when everything is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await loadEnv({
      ...CLERK,
      ...SUPABASE,
      NEXT_PUBLIC_MAPBOX_TOKEN: "pk.mapbox",
    } as Record<string, string>);

    expect(validateEnv()).toEqual({
      mapbox: true,
      clerk: "enabled",
      trackerSync: "enabled",
      // Service role key without an anon key is service mode: enforcement
      // stays in lib/tracker-store.ts rather than Postgres RLS.
      trackerRls: false,
      // No key in this fixture: analytics off is the intended default, and it
      // must not warn — see lib/analytics.ts.
      posthog: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
