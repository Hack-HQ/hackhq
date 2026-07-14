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
