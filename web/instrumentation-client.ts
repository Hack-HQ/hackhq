import * as Sentry from "@sentry/nextjs";

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
