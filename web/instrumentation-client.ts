import * as Sentry from "@sentry/nextjs";
import {
  analyticsEnabled,
  posthogHost,
  posthogProjectToken,
} from "@/lib/analytics";

Sentry.init({
  dsn: "https://f889f4fff91466b19d305b5cbc7cbd51@o4511906995634176.ingest.us.sentry.io/4511907003301888",

  // Errors only for now.
  tracesSampleRate: 0,

  // Don't burn the free-plan log quota.
  enableLogs: false,

  // Errors only means errors ONLY: the SDK's default browserSessionIntegration
  // otherwise pings Sentry with a release-health session on every page view
  // and route change, which both exceeds what this config intends (everything
  // else here is switched off) and contradicts the privacy policy's "data
  // leaves the browser only when an error occurs".
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== "BrowserSession"),
});

// PostHog Web Analytics. Dynamic import + the privacy gate keep posthog-js
// out of the download when analytics is off or the visitor opted out, and
// this file is a client-only Next.js entry so the package is not traced into
// the Cloudflare Worker.
const posthogToken = posthogProjectToken();
const nav = navigator as Navigator & { globalPrivacyControl?: boolean };

if (analyticsEnabled(posthogToken, nav)) {
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.init(posthogToken!, {
      api_host: posthogHost(),
      defaults: "2026-01-30",
      // Cookieless / anonymous Web Analytics.
      persistence: "memory",
      person_profiles: "never",
      // App Router SPA navigations are captured from components/analytics.tsx
      // via usePathname. Automatic pageviews would double-count those.
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      respect_dnt: true,
      // No /flags round-trip (feature flags, experiments, remote session
      // recording / surveys config) and no lazily-fetched extension scripts.
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
    });
    window.posthog = posthog;
    window.dispatchEvent(new Event("hackhq:posthog-ready"));
  });
}
