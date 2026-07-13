// Central, import-once validation of environment configuration.
//
// Nothing here is strictly required — the app degrades without Mapbox/Clerk —
// so we warn rather than throw. But a *partial* Clerk config (one key set, the
// other missing) is a real misconfiguration worth flagging loudly at startup.

export type EnvReport = {
  mapbox: boolean;
  clerk: "enabled" | "disabled" | "partial";
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

export function validateEnv(): EnvReport {
  const mapbox = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const pub = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const secret = Boolean(process.env.CLERK_SECRET_KEY);
  const clerk: EnvReport["clerk"] =
    pub && secret ? "enabled" : !pub && !secret ? "disabled" : "partial";

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
  }
  return { mapbox, clerk };
}
