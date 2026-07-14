import { describe, expect, it } from "vitest";
import {
  coordsFor,
  coordsForListing,
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

  it("does not hand back inherited object properties", () => {
    // A plain-object lookup returns Object for "constructor" and
    // Object.prototype for "__proto__" — both truthy, neither an array. That
    // survives a `?? null` guard, makes lat/lng NaN, passes the globe's
    // `!== null` filter, and mapbox then throws on setLngLat([NaN, NaN]),
    // taking the entire map down. Location strings are LLM-extracted from
    // user-filed issues, so these are reachable inputs.
    expect(coordsFor("constructor")).toBeNull();
    expect(coordsFor("__proto__")).toBeNull();
    expect(coordsFor("toString")).toBeNull();
    expect(coordsFor("hasOwnProperty")).toBeNull();
  });

  it("resolves a city named without its region", () => {
    // "Toronto, Canada" normalizes to "toronto" once the country is stripped,
    // which matches no key — the table stores "toronto, on". Resolve the bare
    // city rather than adding a second Toronto row.
    expect(coordsFor("Toronto, Canada")).toEqual(coordsFor("Toronto, ON"));
    expect(coordsFor("Boston")).toEqual(coordsFor("Boston, MA"));
  });
});

describe("coordsForListing", () => {
  it("places a non-virtual listing", () => {
    expect(coordsForListing("Boston, MA", "In-Person")).toEqual([
      42.3601, -71.0589,
    ]);
    expect(coordsForListing("Boston, MA", "Hybrid")).not.toBeNull();
  });

  it("keeps a virtual listing off the map even when its city is known", () => {
    // The case listings.json does not currently contain, and exactly the one
    // that would scatter online events across the globe if the rule were lost.
    expect(coordsForListing("Boston, MA", "Virtual")).toBeNull();
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
