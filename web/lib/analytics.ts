// Cookieless, anonymous PostHog analytics — off by default.
//
// Privacy posture (why this needs no consent banner):
// - Nothing runs unless NEXT_PUBLIC_POSTHOG_KEY is set. Without it the dynamic
//   import below never executes, so zero bytes of posthog-js reach the browser.
// - `persistence: "memory"` — no cookies, no localStorage, no sessionStorage.
//   Nothing about a visit survives a page reload, so visitors cannot be
//   recognized or tracked across sessions.
// - No autocapture, no session recording, no surveys, and
//   `person_profiles: "never"` — events are anonymous and we never call
//   identify(). This is the standard configuration for consent-banner-free
//   aggregate stats: no personal data is stored on the device or linked to a
//   person, which is what consent requirements attach to.
// - Do Not Track and Global Privacy Control are honored before posthog-js is
//   even downloaded (`trackingDeclined`), and `respect_dnt` backstops that
//   inside the library itself.
//
// The exhaustive `AnalyticsEvent` union is deliberate: pageviews plus exactly
// two product events. Adding an event means widening the union here, which
// keeps tracking scope a reviewed decision instead of a drive-by sprinkle.

export type AnalyticsEvent = "$pageview" | "register_click" | "globe_pin_click";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

// The one posthog-js method we use. A structural type (rather than the
// package's own PostHog type) keeps the contract explicit: widening what we
// call into the library should be as visible in review as widening the events.
type AnalyticsClient = {
  capture: (event: string, properties?: AnalyticsProperties) => unknown;
};

// The browser privacy signals we honor. `globalPrivacyControl` is not in
// TypeScript's Navigator lib yet, so callers pass a structural subset.
export type PrivacySignals = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
};

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * True when the visitor has asked not to be tracked, via either the legacy
 * Do Not Track header/setting or the newer Global Privacy Control. Pure so the
 * gate is testable without a DOM or the posthog-js package.
 */
export function trackingDeclined(signals: PrivacySignals): boolean {
  return signals.doNotTrack === "1" || Boolean(signals.globalPrivacyControl);
}

/**
 * The full init gate: a PostHog key must exist AND the visitor must not have
 * declined tracking. Pure for the same testability reason as above.
 */
export function analyticsEnabled(
  key: string | undefined,
  signals: PrivacySignals,
): boolean {
  return Boolean(key) && !trackingDeclined(signals);
}

// Memoized so the gate runs (and posthog-js loads) at most once per page load.
// A `null` resolution is cached too: env vars are inlined at build time and a
// DNT/GPC change requires a reload, so "disabled" cannot flip mid-session.
let clientPromise: Promise<AnalyticsClient | null> | null = null;

function getClient(): Promise<AnalyticsClient | null> {
  clientPromise ??= (async () => {
    // Server components / SSR passes: never init.
    if (typeof window === "undefined") return null;
    // Literal `process.env.NEXT_PUBLIC_*` references so Next.js inlines the
    // values into the client bundle at build time.
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!analyticsEnabled(key, nav)) return null;

    // Dynamic import: posthog-js lives in its own async chunk that is only
    // fetched when the gate passes — a keyless build ships none of it.
    const { default: posthog } = await import("posthog-js");
    posthog.init(key!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
      // The cookieless/anonymous posture documented at the top of this file.
      persistence: "memory",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false, // pageviews are sent manually (components/analytics.tsx)
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      respect_dnt: true,
      // No feature flags and no lazily-fetched extension scripts (recorder,
      // toolbar…): fewer network calls, and nothing beyond the audited bundle.
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
    });
    return posthog;
  })();
  return clientPromise;
}

/**
 * Fire-and-forget event capture. Safe to call from any client code path: when
 * analytics is disabled (no key, DNT/GPC, SSR) this resolves to a no-op.
 */
export function capture(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  void getClient().then((client) => client?.capture(event, properties));
}
