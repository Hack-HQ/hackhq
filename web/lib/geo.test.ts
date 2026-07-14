import { describe, expect, it } from "vitest";
import {
  coordsFor,
  isUnmappable,
  knownLocations,
  normalizeLocation,
} from "./geo";

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

describe("coordsFor", () => {
  it("resolves a plain location", () => {
    expect(coordsFor("Boston, MA")).toEqual([42.3601, -71.0589]);
  });

  it("resolves the aliases that used to miss the table", () => {
    // The regression from #111: both spellings must land on one Toronto.
    expect(coordsFor("Toronto, ON, Canada")).toEqual(coordsFor("Toronto, ON"));
    expect(coordsFor("  seattle , wa ")).toEqual(coordsFor("Seattle, WA"));
  });

  it("returns null for a location it has never seen", () => {
    expect(coordsFor("Atlantis, XX")).toBeNull();
  });
});

describe("isUnmappable", () => {
  it("recognizes TBA regardless of spelling", () => {
    expect(isUnmappable("TBA")).toBe(true);
    expect(isUnmappable(" tba ")).toBe(true);
  });

  it("does not excuse a real city that is merely missing", () => {
    expect(isUnmappable("Atlantis, XX")).toBe(false);
  });
});

describe("the table itself", () => {
  it("is stored in normalized form", () => {
    // A key that isn't already normalized is unreachable through coordsFor.
    for (const key of knownLocations()) {
      expect(normalizeLocation(key)).toBe(key);
    }
  });
});
