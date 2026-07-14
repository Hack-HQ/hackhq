"""Tests for check_geo_coverage.py, the globe's guard on the automation path.

The interesting risk here is drift: `check_geo_coverage.normalize_location` is a
Python twin of `normalizeLocation` in web/lib/geo.ts, and two implementations of
one rule will wander apart unless something holds them together. So the country
list is read out of the TypeScript and compared, rather than trusted.
"""

import json
import os
import re
import unittest

import check_geo_coverage as cgc

GEO_TS = os.path.join(
    os.path.dirname(__file__), "..", "..", "web", "lib", "geo.ts"
)


class Normalization(unittest.TestCase):
    def test_matches_the_typescript_rules(self):
        self.assertEqual(cgc.normalize_location("  Boston, MA  "), "boston, ma")
        self.assertEqual(cgc.normalize_location("New  York ,NY"), "new york, ny")
        self.assertEqual(
            cgc.normalize_location("Toronto, ON, Canada"),
            cgc.normalize_location("Toronto, ON"),
        )
        # A bare country survives rather than normalizing to nothing.
        self.assertEqual(cgc.normalize_location("Canada"), "canada")

    def test_country_list_has_not_drifted_from_geo_ts(self):
        """The two normalizers must strip the same countries.

        If someone teaches geo.ts about a new country suffix and not this file,
        the site would place a listing that the automation reports as missing -
        an issue comment nagging a maintainer about a city already on the map.
        """
        with open(GEO_TS, encoding="utf-8") as f:
            src = f.read()
        block = re.search(
            r"const COUNTRY_SUFFIXES = \[(.*?)\];", src, re.S
        )
        self.assertIsNotNone(block, "COUNTRY_SUFFIXES not found in web/lib/geo.ts")
        in_ts = set(re.findall(r'"([^"]+)"', block.group(1)))
        self.assertEqual(
            in_ts,
            cgc.COUNTRY_SUFFIXES,
            "COUNTRY_SUFFIXES in web/lib/geo.ts and check_geo_coverage.py have "
            "drifted apart - the site and the automation would disagree about "
            "which listings are on the globe",
        )


class Coverage(unittest.TestCase):
    def setUp(self):
        self.coords, self.cities, self.unmappable = cgc.load_geocodes()

    def test_the_real_listings_are_all_placeable(self):
        with open(cgc.LISTINGS, encoding="utf-8") as f:
            listings = json.load(f)
        missing = cgc.unplaceable(
            listings, self.coords, self.cities, self.unmappable
        )
        self.assertEqual(
            [],
            missing,
            "listings.json has locations the globe cannot place: "
            + ", ".join(loc for loc, _ in missing),
        )

    def test_an_unknown_city_is_reported(self):
        listings = [
            {"title": "Ghost Hack", "locations": ["Atlantis, XX"], "format": "In-Person"}
        ]
        missing = cgc.unplaceable(
            listings, self.coords, self.cities, self.unmappable
        )
        self.assertEqual([("Atlantis, XX", "Ghost Hack")], missing)

    def test_virtual_and_tba_are_not_reported(self):
        listings = [
            {"title": "Online", "locations": ["Atlantis, XX"], "format": "Virtual"},
            {"title": "No venue", "locations": ["TBA"], "format": "In-Person"},
            {"title": "Blank", "locations": [""], "format": "In-Person"},
            {"title": "Hidden", "locations": ["Atlantis, XX"], "is_visible": False},
        ]
        self.assertEqual(
            [],
            cgc.unplaceable(listings, self.coords, self.cities, self.unmappable),
        )

    def test_the_bare_city_fallback_works_here_too(self):
        # geo.ts resolves "Toronto, Canada" -> "toronto" -> the one Toronto.
        listings = [
            {"title": "T", "locations": ["Toronto, Canada"], "format": "In-Person"}
        ]
        self.assertEqual(
            [],
            cgc.unplaceable(listings, self.coords, self.cities, self.unmappable),
        )


if __name__ == "__main__":
    unittest.main()
