// Central, import-once validation of environment configuration.
//
// Nothing here is strictly required — the app degrades without Mapbox/Clerk —
// so we warn rather than throw. But a *partial* Clerk config (one key set, the
// other missing) is a real misconfiguration worth flagging loudly at startup.

export type Availability = "enabled" | "disabled" | "partial";

export type EnvReport = {
  mapbox: boolean;
  clerk: Availability;
  trackerSync: Availability;
  // True when tracker writes run in token mode (SUPABASE_ANON_KEY set): each
  // request carries the caller's Clerk JWT and Postgres RLS enforces row
  // ownership. False means service mode, where lib/tracker-store.ts enforces
  // ownership in app code with the service role key.
  trackerRls: boolean;
  posthog: boolean;
};

let reported = false;

// Sign-in is only wired up when BOTH keys exist: the publishable key mounts
// <ClerkProvider>, the secret key lets the proxy verify sessions. Anything less
// and every Clerk-dependent surface (/auth, the /my gate) must stay switched off.
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
}

// Persisting a tracker needs somewhere to put it *and* someone to attribute it
// to, so this is deliberately Clerk-inclusive: with Supabase configured but
// sign-in switched off there is no user id, and /api/tracker would have nothing
// to scope a row by. Either key works: SUPABASE_ANON_KEY selects token mode
// (requests carry the caller's Clerk JWT, RLS enforces ownership in Postgres),
// SUPABASE_SERVICE_ROLE_KEY alone selects service mode (ownership enforced in
// lib/tracker-store.ts). All variables are server-only (no NEXT_PUBLIC_
// prefix), so neither key reaches the browser bundle.
export function isTrackerSyncConfigured(): boolean {
  return Boolean(
    isClerkConfigured() &&
      process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}

function availability(...flags: boolean[]): Availability {
  if (flags.every(Boolean)) return "enabled";
  if (flags.every((f) => !f)) return "disabled";
  return "partial";
}

export function validateEnv(): EnvReport {
  const mapbox = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  // Reported for completeness only — an absent token is the intended default
  // (analytics stays entirely off, see lib/analytics.ts), so no warning.
  const posthog = Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
      process.env.NEXT_PUBLIC_POSTHOG_KEY,
  );
  const pub = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const secret = Boolean(process.env.CLERK_SECRET_KEY);
  const supabaseUrl = Boolean(process.env.SUPABASE_URL);
  const serviceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = Boolean(process.env.SUPABASE_ANON_KEY);
  const clerk = availability(pub, secret);
  // Either key satisfies "a way to authenticate": the anon key flips writes
  // onto the caller's Clerk token (RLS in Postgres), the service role key keeps
  // the legacy app-layer enforcement. tracker-store prefers the anon key when
  // both are set.
  const trackerSync = availability(supabaseUrl, serviceKey || anonKey);
  const trackerRls = anonKey;

  if (!reported) {
    reported = true;
    if (!mapbox) {
      console.warn(
        "[env] NEXT_PUBLIC_MAPBOX_TOKEN is not set - the globe will show a placeholder.",
      );
    }
    if (clerk === "partial") {
      console.warn(
        "[env] Clerk is half-configured: set BOTH NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY " +
          "and CLERK_SECRET_KEY, or neither. Sign-in stays disabled until both exist.",
      );
    }
    if (trackerSync === "partial") {
      console.warn(
        "[env] Supabase is half-configured: set SUPABASE_URL plus a key " +
          "(SUPABASE_ANON_KEY for token mode, SUPABASE_SERVICE_ROLE_KEY for service mode), " +
          "or none of them. Trackers stay browser-local until then.",
      );
    }
    // Token mode has no credential at all without Clerk: the anon key only
    // identifies the project, the caller's Clerk JWT is what authenticates.
    // More specific than the generic warning below, so it takes its place.
    if (anonKey && clerk !== "enabled") {
      console.warn(
        "[env] SUPABASE_ANON_KEY is set but Clerk is not fully configured. Token mode " +
          "authenticates tracker writes with the caller's Clerk JWT, so tracker sync " +
          "stays off until both Clerk keys exist.",
      );
    } else if (trackerSync === "enabled" && clerk !== "enabled") {
      // Not "partial" in the half-configured sense — both Supabase values are
      // present and valid — but the result is the same dead end, so it is worth
      // the same warning rather than a silent fallback to localStorage.
      console.warn(
        "[env] Supabase is configured but Clerk is not, so tracker sync stays off: " +
          "there is no signed-in user to attribute a saved hackathon to.",
      );
    }
  }
  return { mapbox, clerk, trackerSync, trackerRls, posthog };
}
