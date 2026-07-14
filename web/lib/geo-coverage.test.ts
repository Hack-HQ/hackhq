import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coordsFor, isUnmappable } from "./geo";
import { loadHackathons } from "./listings";

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

  it("keeps virtual listings off the map even when their location is known", () => {
    // Not a coverage gap: a virtual hackathon has nowhere to be. But "Virtual"
    // and a real city are not mutually exclusive in the data — a listing can be
    // Virtual and still carry "Boston, MA" — so the exclusion has to hold on
    // *behaviour*, not on the current shape of listings.json.
    //
    // Asserting merely that some virtual listings exist would be a fact about
    // the data, not about the code, and would start failing the day the repo
    // happens to have none.
    const virtual = loadHackathons().filter((h) => h.format === "Virtual");

    for (const h of virtual) {
      expect(
        [h.lat, h.lng],
        `${h.title} is Virtual but was given coordinates from "${h.location}"`,
      ).toEqual([null, null]);
    }
  });
});
