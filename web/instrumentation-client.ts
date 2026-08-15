import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!posthogProjectToken || !posthogHost) {
  if (process.env.NODE_ENV === "development") {
    const missingVariable = posthogProjectToken
      ? "NEXT_PUBLIC_POSTHOG_HOST"
      : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    debug: process.env.NODE_ENV === "development",
  });
}

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
