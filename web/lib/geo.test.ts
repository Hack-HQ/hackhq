import { describe, expect, it } from "vitest";
import { normalizeLocation } from "./geo";

describe("normalizeLocation", () => {
  it("lowercases and trims", () => {
    expect(normalizeLocation("  Boston, MA  ")).toBe("boston, ma");
  });

  it("collapses whitespace and spacing around the separator", () => {
    expect(normalizeLocation("New  York ,NY")).toBe("new york, ny");
  });

  it("treats a trailing country as noise", () => {
    // The bug in #111: these two spellings were separate table keys.
    expect(normalizeLocation("Toronto, ON, Canada")).toBe(
      normalizeLocation("Toronto, ON"),
    );
    expect(normalizeLocation("Austin, TX, USA")).toBe(
      normalizeLocation("Austin, TX"),
    );
  });

  it("strips only trailing countries, never the whole string", () => {
    // A bare country is all we have — keep it rather than normalizing to "".
    expect(normalizeLocation("Canada")).toBe("canada");
  });

  it("keeps a foreign city intact", () => {
    expect(normalizeLocation("Ho Chi Minh City, Vietnam")).toBe(
      "ho chi minh city, vietnam",
    );
  });

  it("is idempotent", () => {
    const once = normalizeLocation("Toronto, ON, Canada");
    expect(normalizeLocation(once)).toBe(once);
  });
});
