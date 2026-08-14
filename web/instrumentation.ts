// Loads the server/edge Sentry configs. This was an empty stub, which meant
// sentry.server.config.ts and sentry.edge.config.ts were never imported -
// only browser errors reported, and server-side crashes vanished silently.
// This is the canonical @sentry/nextjs wiring from the official docs.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
