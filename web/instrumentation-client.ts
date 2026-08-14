import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://f889f4fff91466b19d305b5cbc7cbd51@o4511906995634176.ingest.us.sentry.io/4511907003301888",

  // Errors only for now.
  tracesSampleRate: 0,

  // Don't burn the free-plan log quota.
  enableLogs: false,
});
