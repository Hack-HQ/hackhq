"""Guard on the maintainer-featured set in listings.json (#150).

`featured` pins a listing to the top of the deck (util.sort_listings) and gives
it a slot in the generated README (update_readmes.py). Nothing expires it, so a
hackathon stays pinned there after its deadline passes unless a human notices —
which is the state #150 was filed about.

Why the check is on the deadline rather than on `resolve_state`: the two can
disagree. `resolve_state` reads `active`/`state`, and those are updated by the
closing_soon automation, so a listing whose deadline has passed can still be
carrying `active: true, state: "open"` until the next run. Featuring is a
promise the site makes on the homepage, so it is held to the harder fact.
"""

import json
import os
import unittest
from datetime import datetime

import util

PST = util.PST


def _today():
    return datetime.now(tz=PST).date()


class FeaturedSet(unittest.TestCase):
    def setUp(self):
        with open(util.LISTINGS_FILE, encoding="utf-8") as f:
            self.listings = json.load(f)
        self.featured = [x for x in self.listings if util.is_featured(x)]

    def test_no_featured_listing_is_past_its_deadline(self):
        today = _today()
        expired = [
            (x.get("deadline"), x.get("title", "<untitled>"))
            for x in self.featured
            if x.get("deadline")
            and util.parse_deadline_date(x["deadline"]) < today
        ]
        self.assertEqual(
            [],
            expired,
            "featured listings are past their deadline and would still be "
            "pinned to the top of the deck and the README:\n"
            + "\n".join(f"  - {d}  {t}" for d, t in expired),
        )

    def test_no_featured_listing_is_closed(self):
        closed = [
            x.get("title", "<untitled>")
            for x in self.featured
            if util.resolve_state(x) == "closed"
        ]
        self.assertEqual([], closed, f"closed listings are featured: {closed}")

    def test_no_featured_listing_is_hidden(self):
        # Pinning something the site does not render would leave a hole at the
        # top of the deck rather than a promoted listing.
        hidden = [
            x.get("title", "<untitled>")
            for x in self.featured
            if x.get("is_visible") is False
        ]
        self.assertEqual([], hidden, f"hidden listings are featured: {hidden}")


if __name__ == "__main__":
    unittest.main()
