import fs from "node:fs";
import path from "node:path";

/**
 * Location -> coordinates for the globe.
 *
 * The globe can only render a listing it has coordinates for, so a location
 * string that misses the table silently disappears from the map (#111). Two
 * things keep that from happening quietly:
 *
 *  - Lookups normalize first, so "Toronto, ON" and "Toronto, ON, Canada" are
 *    the same key rather than two entries that must both be remembered.
 *  - Anything that still misses is a *reported* miss: loadHackathons warns,
 *    the globe surfaces a count, a coverage test fails CI on pull requests, and
 *    the listing automation comments on the issue. Only the locations named in
 *    `unmappable` are allowed to have no coordinates.
 *
 * The table itself lives in .github/scripts/geocodes.json because the listing
 * automation (Python) has to answer the same question this module does, and the
 * two must not drift. Server-side only — like lib/listings.ts, this reads from
 * disk at build/render time and must not be pulled into a client component.
 */

const GEOCODES_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "scripts",
  "geocodes.json",
);

type GeocodeFile = {
  coordinates: Record<string, [number, number]>;
  unmappable: string[];
};

const FILE: GeocodeFile = JSON.parse(fs.readFileSync(GEOCODES_PATH, "utf8"));

/** Country suffixes we drop: the city + region prefix already disambiguates. */
const COUNTRY_SUFFIXES = [
  "usa",
  "u.s.a.",
  "us",
  "u.s.",
  "united states",
  "canada",
];

/**
 * Fold a raw location string into a stable lookup key.
 *
 * Case, surrounding whitespace, doubled spaces, spacing around separators, and
 * a trailing country all stop mattering — "  toronto ,ON , Canada " and
 * "Toronto, ON" both become "toronto, on".
 */
export function normalizeLocation(location: string): string {
  const parts = location
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  while (
    parts.length > 1 &&
    COUNTRY_SUFFIXES.includes(parts[parts.length - 1] ?? "")
  ) {
    parts.pop();
  }

  return parts.join(", ");
}

/**
 * Coordinates for every location we place on the globe, keyed by the normalized
 * form. Add a city here the moment a listing introduces one — the coverage test
 * fails CI until you do.
 */
const GEO = FILE.coordinates;

/**
 * Locations that legitimately have no point on a map. These are *allowed* to be
 * coordinate-less; everything else that misses the table is a bug, not a shrug.
 */
const UNMAPPABLE = new Set(FILE.unmappable);

/** True when a location is knowingly un-mappable rather than merely missing. */
export function isUnmappable(location: string): boolean {
  return UNMAPPABLE.has(normalizeLocation(location));
}

/**
 * The table as a Map, plus a city-only index.
 *
 * A Map, not the object literal, because `GEO["constructor"]` walks the
 * prototype chain and hands back `Object` — truthy, not an array. That sails
 * through a `?? null` check, `lat = geo[0] + 0` becomes NaN, `NaN !== null`
 * passes the globe's filter, and mapbox throws on setLngLat([NaN, NaN]),
 * taking the whole map down. Location strings are LLM-extracted from
 * user-filed issues, so "constructor" is not a hypothetical input.
 */
const TABLE = new Map<string, [number, number]>(Object.entries(GEO));

/**
 * City name -> coordinates, for the cities whose name is unambiguous in TABLE.
 *
 * Stripping the country off "Toronto, Canada" leaves "toronto", which matches
 * no key ("toronto, on" has the province). Rather than re-introducing the
 * duplicate entries this module exists to delete, resolve a bare city name when
 * exactly one city in the table carries it. Two cities sharing a name (a
 * Cambridge, MA and a Cambridge, UK) make the name ambiguous, so it resolves to
 * nothing and the coverage test speaks up — a loud miss beats a confident pin
 * in the wrong country.
 */
const CITY_INDEX = (() => {
  const byCity = new Map<string, [number, number][]>();
  for (const [key, coords] of TABLE) {
    const city = key.split(",")[0]?.trim() ?? "";
    if (!city) continue;
    byCity.set(city, [...(byCity.get(city) ?? []), coords]);
  }
  const unique = new Map<string, [number, number]>();
  for (const [city, hits] of byCity) {
    if (hits.length === 1 && hits[0]) unique.set(city, hits[0]);
  }
  return unique;
})();

/** Coordinates for a location, or null when the table has no entry. */
export function coordsFor(location: string): [number, number] | null {
  const key = normalizeLocation(location);
  return TABLE.get(key) ?? CITY_INDEX.get(key) ?? null;
}

/**
 * Coordinates for a listing — the rule the globe actually runs on.
 *
 * Virtual is not merely "a listing that happens to have no city": a Virtual
 * listing can still carry a real location string, and it must *still* stay off
 * the map. Keeping that rule here, rather than inline at the call site, is what
 * lets it be tested without depending on today's listings.json happening to
 * contain such a listing.
 */
export function coordsForListing(
  location: string,
  format?: string,
): [number, number] | null {
  if (format === "Virtual") return null;
  return coordsFor(location);
}

/** Every location string the globe knows how to place. Used by the tests. */
export function knownLocations(): string[] {
  return [...TABLE.keys()];
}
