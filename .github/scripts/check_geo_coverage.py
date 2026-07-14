#!/usr/bin/env python3
"""Report listings the globe cannot place (#111).

The site refuses to render a listing without coordinates, so a hackathon in a
city that `geocodes.json` doesn't know is live in the README and the deck while
being absent from the globe.

`web/lib/geo-coverage.test.ts` catches that on pull requests. It cannot catch it
on the path that actually adds most listings: `auto_extract` and
`contribution_approved` push straight to `main` with the default GITHUB_TOKEN,
and GitHub does not start workflow runs for commits pushed with that token — so
Web CI never sees them. This script is the same check, in the language those
workflows already speak, so they can say something on the issue instead.

It never fails the job. A missing city should not block a contribution: the
listing still lands, the globe says how many hackathons it isn't showing, and
this comment tells a maintainer which city to add.

Usage:
    python .github/scripts/check_geo_coverage.py

Writes `missing` (a human-readable summary, empty when all is well) to
$GITHUB_OUTPUT when running in Actions.
"""

import json
import os
import sys

HERE = os.path.dirname(__file__)
GEOCODES = os.path.join(HERE, "geocodes.json")
LISTINGS = os.path.join(HERE, "listings.json")

# Kept in lockstep with COUNTRY_SUFFIXES in web/lib/geo.ts. test_scripts.py
# asserts the two agree on the listings we actually have.
COUNTRY_SUFFIXES = {"usa", "u.s.a.", "us", "u.s.", "united states", "canada"}


def normalize_location(location):
    """The Python twin of normalizeLocation() in web/lib/geo.ts."""
    parts = [p.strip() for p in " ".join(location.lower().split()).split(",")]
    parts = [p for p in parts if p]
    while len(parts) > 1 and parts[-1] in COUNTRY_SUFFIXES:
        parts.pop()
    return ", ".join(parts)


def load_geocodes():
    with open(GEOCODES, encoding="utf-8") as f:
        data = json.load(f)
    coords = data["coordinates"]
    # The bare-city fallback from geo.ts: a city name resolves when exactly one
    # city in the table carries it.
    cities = {}
    for key in coords:
        city = key.split(",")[0].strip()
        cities.setdefault(city, []).append(key)
    unique = {c: keys[0] for c, keys in cities.items() if len(keys) == 1}
    return coords, unique, {u.lower() for u in data["unmappable"]}


def unplaceable(listings, coords, cities, unmappable):
    """Visible, non-virtual listings the globe has no coordinates for."""
    out = []
    for r in listings:
        if r.get("is_visible") is False or r.get("format") == "Virtual":
            continue
        raw = (r.get("locations") or [""])[0].strip() or "TBA"
        key = normalize_location(raw)
        if key in coords or key in cities or key in unmappable:
            continue
        out.append((raw, r.get("title", "?")))
    return out


def main():
    coords, cities, unmappable = load_geocodes()
    with open(LISTINGS, encoding="utf-8") as f:
        listings = json.load(f)

    missing = unplaceable(listings, coords, cities, unmappable)

    if missing:
        lines = [
            f"{len(missing)} listing(s) have no coordinates and will not appear "
            f"on the globe:",
        ]
        for location, title in missing:
            lines.append(f"  - {location}  ({title})")
        lines.append("")
        lines.append(
            "Add the location to `coordinates` in .github/scripts/geocodes.json "
            "(or to `unmappable` if it genuinely has no place on a map)."
        )
        summary = "\n".join(lines)
        print(summary)
    else:
        summary = ""
        print("All visible non-virtual listings can be placed on the globe.")

    out_path = os.environ.get("GITHUB_OUTPUT")
    if out_path:
        with open(out_path, "a", encoding="utf-8") as f:
            f.write("missing<<EOF\n")
            f.write(summary + "\n")
            f.write("EOF\n")

    # Deliberately always 0: a city we cannot place must not block a listing.
    return 0


if __name__ == "__main__":
    sys.exit(main())
