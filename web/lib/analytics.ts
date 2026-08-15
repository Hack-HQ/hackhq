// Cookieless, anonymous PostHog Web Analytics — off by default.
//
// posthog-js is imported only from instrumentation-client.ts (a Next.js
// client-only entry). Nothing in the React tree imports the package, so it
// must not appear in the Cloudflare Worker / SSR graph.
//
// Privacy posture (why this needs no consent banner):
// - Nothing inits unless NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN (or the legacy
//   NEXT_PUBLIC_POSTHOG_KEY) is set.
// - `persistence: "memory"` — no cookies, no localStorage, no sessionStorage.
// - No autocapture, session recording, surveys, feature flags, exception
//   capture, or user identification. `person_profiles: "never"`.
// - Do Not Track and Global Privacy Control skip the posthog-js download.

export type PrivacySignals = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
};

export type PostHogPageviewClient = {
  capture: (event: "$pageview", properties?: { $current_url: string }) => unknown;
};

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

declare global {
  interface Window {
    posthog?: PostHogPageviewClient;
  }
}

/**
 * True when the visitor has asked not to be tracked, via either the legacy
 * Do Not Track header/setting or the newer Global Privacy Control. Pure so the
 * gate is testable without a DOM or the posthog-js package.
 */
export function trackingDeclined(signals: PrivacySignals): boolean {
  return signals.doNotTrack === "1" || Boolean(signals.globalPrivacyControl);
}

/**
 * The full init gate: a PostHog token must exist AND the visitor must not have
 * declined tracking. Pure for the same testability reason as above.
 */
export function analyticsEnabled(
  token: string | undefined,
  signals: PrivacySignals,
): boolean {
  return Boolean(token) && !trackingDeclined(signals);
}

/**
 * Literal `process.env.NEXT_PUBLIC_*` references so Next.js inlines the
 * values into the client bundle at build time.
 */
export function posthogProjectToken(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY
  );
}

export function posthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST;
}

/** Fire a Web Analytics `$pageview` if PostHog finished initializing. */
export function capturePageview(): void {
  if (typeof window === "undefined") return;
  window.posthog?.capture("$pageview", { $current_url: window.location.href });
}
