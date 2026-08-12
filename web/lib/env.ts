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
// to scope a row by. Both variables are server-only — no NEXT_PUBLIC_ prefix —
// so the service role key never reaches the browser bundle.
export function isTrackerSyncConfigured(): boolean {
  return Boolean(
    isClerkConfigured() &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function availability(...flags: boolean[]): Availability {
  if (flags.every(Boolean)) return "enabled";
  if (flags.every((f) => !f)) return "disabled";
  return "partial";
}

export function validateEnv(): EnvReport {
  const mapbox = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  // Reported for completeness only — an absent key is the intended default
  // (analytics stays entirely off, see lib/analytics.ts), so no warning.
  const posthog = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const pub = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const secret = Boolean(process.env.CLERK_SECRET_KEY);
  const supabaseUrl = Boolean(process.env.SUPABASE_URL);
  const supabaseKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const clerk = availability(pub, secret);
  const trackerSync = availability(supabaseUrl, supabaseKey);

  if (!reported) {
    reported = true;
    if (!mapbox) {
      console.warn(
        "[env] NEXT_PUBLIC_MAPBOX_TOKEN is not set — the globe will show a placeholder.",
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
        "[env] Supabase is half-configured: set BOTH SUPABASE_URL and " +
          "SUPABASE_SERVICE_ROLE_KEY, or neither. Trackers stay browser-local until both exist.",
      );
    }
    // Not "partial" in the half-configured sense — both Supabase values are
    // present and valid — but the result is the same dead end, so it is worth
    // the same warning rather than a silent fallback to localStorage.
    if (trackerSync === "enabled" && clerk !== "enabled") {
      console.warn(
        "[env] Supabase is configured but Clerk is not, so tracker sync stays off: " +
          "there is no signed-in user to attribute a saved hackathon to.",
      );
    }
  }
  return { mapbox, clerk, trackerSync, posthog };
}
