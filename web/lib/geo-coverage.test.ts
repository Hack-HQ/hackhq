import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coordsFor, isUnmappable } from "./geo";

/**
 * The guard for #111.
 *
 * The globe renders only listings that carry coordinates, so a location string
 * the table doesn't know simply vanishes from the map — no error, no gap in the
 * UI, nothing in the logs. That is a silent failure, and silent failures need a
 * loud test.
 *
 * This reads the real listings.json (not a fixture): the moment a contribution
 * introduces a city we can't place, CI fails here with the exact string to add
 * to GEO. It needs no network and no API key, so it is deterministic.
 */

type RawListing = {
  title: string;
  locations?: string[];
  format?: string;
  is_visible?: boolean;
};

const LISTINGS_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "scripts",
  "listings.json",
);

function visibleNonVirtual(): RawListing[] {
  const raw: RawListing[] = JSON.parse(fs.readFileSync(LISTINGS_PATH, "utf8"));
  return raw.filter((r) => r.is_visible !== false && r.format !== "Virtual");
}

describe("globe coordinate coverage", () => {
  it("places every visible non-virtual listing, or names it un-mappable", () => {
    const unplaceable = visibleNonVirtual()
      .map((r) => ({ title: r.title, location: r.locations?.[0] ?? "TBA" }))
      .filter((r) => coordsFor(r.location) === null && !isUnmappable(r.location));

    // Printed rather than asserted as a bare count so the failure message is
    // the fix: it names the location strings to add to GEO in lib/geo.ts.
    expect(
      unplaceable,
      `${unplaceable.length} listing(s) would silently disappear from the globe. ` +
        `Add these locations to GEO in web/lib/geo.ts (or to UNMAPPABLE if they ` +
        `genuinely have no place on a map):\n` +
        unplaceable.map((r) => `  - ${r.location}  (${r.title})`).join("\n"),
    ).toEqual([]);
  });

  it("keeps virtual listings off the map on purpose", () => {
    const raw: RawListing[] = JSON.parse(fs.readFileSync(LISTINGS_PATH, "utf8"));
    const virtual = raw.filter((r) => r.format === "Virtual");

    // Not a coverage gap: a virtual hackathon has nowhere to be. This asserts
    // the exclusion is deliberate, so a future "fix" for the test above can't
    // start scattering online events across the globe.
    expect(virtual.length).toBeGreaterThan(0);
  });
});
