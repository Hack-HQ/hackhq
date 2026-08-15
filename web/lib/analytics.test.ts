import { describe, it, expect } from "vitest";
import {
  analyticsEnabled,
  capturePageview,
  trackingDeclined,
} from "./analytics";

// Only the pure gate is tested: the posthog-js side of analytics lives in
// instrumentation-client.ts behind a dynamic import these paths must never
// reach, and asserting the gate is exactly how we know it doesn't.

describe("trackingDeclined", () => {
  it("honors Do Not Track", () => {
    expect(trackingDeclined({ doNotTrack: "1" })).toBe(true);
  });

  it("honors Global Privacy Control", () => {
    expect(trackingDeclined({ globalPrivacyControl: true })).toBe(true);
  });

  it("does not decline when neither signal is set", () => {
    expect(trackingDeclined({})).toBe(false);
    // Chromium reports null, Firefox "unspecified", when DNT is off.
    expect(trackingDeclined({ doNotTrack: null })).toBe(false);
    expect(trackingDeclined({ doNotTrack: "unspecified" })).toBe(false);
    expect(trackingDeclined({ doNotTrack: "0", globalPrivacyControl: false })).toBe(
      false,
    );
  });
});

describe("analyticsEnabled", () => {
  it("requires a PostHog token", () => {
    expect(analyticsEnabled(undefined, {})).toBe(false);
    expect(analyticsEnabled("", {})).toBe(false);
  });

  it("requires the visitor not to have declined tracking", () => {
    expect(analyticsEnabled("phc_test", { doNotTrack: "1" })).toBe(false);
    expect(analyticsEnabled("phc_test", { globalPrivacyControl: true })).toBe(false);
  });

  it("enables only with a token and no opt-out signal", () => {
    expect(analyticsEnabled("phc_test", {})).toBe(true);
    expect(analyticsEnabled("phc_test", { doNotTrack: "0" })).toBe(true);
  });
});

describe("capturePageview", () => {
  it("is a safe no-op without a browser PostHog client", () => {
    expect(() => capturePageview()).not.toThrow();
  });
});
