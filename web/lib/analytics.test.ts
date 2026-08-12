import { describe, it, expect } from "vitest";
import { analyticsEnabled, capture, trackingDeclined } from "./analytics";

// Only the pure gate is tested: the posthog-js side of analytics.ts hides
// behind a dynamic import that these paths must never reach, and asserting the
// gate is exactly how we know it doesn't.

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
  it("requires a PostHog key", () => {
    expect(analyticsEnabled(undefined, {})).toBe(false);
    expect(analyticsEnabled("", {})).toBe(false);
  });

  it("requires the visitor not to have declined tracking", () => {
    expect(analyticsEnabled("phc_test", { doNotTrack: "1" })).toBe(false);
    expect(analyticsEnabled("phc_test", { globalPrivacyControl: true })).toBe(false);
  });

  it("enables only with a key and no opt-out signal", () => {
    expect(analyticsEnabled("phc_test", {})).toBe(true);
    expect(analyticsEnabled("phc_test", { doNotTrack: "0" })).toBe(true);
  });
});

describe("capture", () => {
  it("is a safe no-op without a browser environment", () => {
    // Vitest runs in Node (no `window`), so the client gate resolves to null;
    // capture must swallow that instead of throwing or importing posthog-js.
    expect(() => capture("register_click", { id: "x" })).not.toThrow();
  });
});
