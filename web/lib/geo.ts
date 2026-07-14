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
 *    the globe surfaces a count, and a coverage test fails CI. Only the
 *    locations listed in UNMAPPABLE are allowed to have no coordinates.
 */

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
 * Coordinates for every location we place on the globe, keyed by the
 * normalized form. Add a city here the moment a listing introduces it — the
 * coverage test in geo-coverage.test.ts fails CI until you do.
 */
const GEO: Record<string, [number, number]> = {
  "amherst, ma": [42.3732, -72.5199],
  "ann arbor, mi": [42.2808, -83.743],
  "atlanta, ga": [33.749, -84.388],
  "austin, tx": [30.2672, -97.7431],
  "berkeley / san francisco, ca": [37.8715, -122.273],
  "blacksburg, va": [37.2296, -80.4139],
  "boston, ma": [42.3601, -71.0589],
  "cambridge, ma": [42.3736, -71.1097],
  "chapel hill, nc": [35.9132, -79.0558],
  "college park, md": [38.9897, -76.9378],
  "dearborn, mi": [42.3223, -83.1763],
  "greensboro, nc": [36.0726, -79.792],
  "hamilton, on": [43.2557, -79.8711],
  "ho chi minh city, vietnam": [10.7769, 106.7009],
  "houston, tx": [29.7604, -95.3698],
  "ithaca, ny": [42.444, -76.5019],
  "kolkata, india": [22.5726, 88.3639],
  "los angeles, ca": [34.0522, -118.2437],
  "miami, fl": [25.7617, -80.1918],
  "new york, ny": [40.7128, -74.006],
  "newark, nj": [40.7357, -74.1724],
  "orlando, fl": [28.5384, -81.3789],
  "ottawa, on": [45.4215, -75.6972],
  "philadelphia, pa": [39.9526, -75.1652],
  "pittsburgh, pa": [40.4406, -79.9959],
  "providence, ri": [41.824, -71.4128],
  "san francisco, ca": [37.7749, -122.4194],
  "santa clara, ca": [37.3541, -121.9552],
  "seattle, wa": [47.6062, -122.3321],
  "stony brook, ny": [40.9257, -73.1409],
  "toronto, on": [43.6532, -79.3832],
  "troy, ny": [42.7284, -73.6918],
  "vancouver, bc": [49.2827, -123.1207],
};

/**
 * Locations that legitimately have no point on a map. These are *allowed* to
 * be coordinate-less; everything else that misses GEO is a bug, not a shrug.
 *
 * Keep this list to locations that actually appear in listings.json. A venue
 * name nobody has submitted yet belongs here only once it shows up — until
 * then the coverage test is the thing that tells us it arrived.
 */
const UNMAPPABLE = new Set(["tba"]);

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
