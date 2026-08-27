"""Coverage for check_site_freshness.py.

The check exists because a hackathon can be in `listings.json` and absent from
the live site, with every other signal green. These tests pin the two ways that
check could quietly stop working:

  * a false negative - the matcher reports "all present" for a listing the page
    does not contain, which would restore the exact silence this script was
    written to break;
  * a false positive - the matcher reports a listing missing when it is on the
    page, which trains people to ignore a red run.

Offline by construction: every test feeds `missing_listings` a string. Nothing
here touches the network, so the suite stays runnable in CI and on a laptop with
no site to talk to.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import check_site_freshness as freshness  # noqa: E402


def listing(**kw):
    base = {
        "id": "abc",
        "title": "Example Hackathon 2026",
        "company_name": "Example Org",
        "url": "https://example-hack.devpost.com/",
    }
    base.update(kw)
    return base


class Matching(unittest.TestCase):
    def test_listing_is_present_when_its_url_is_in_the_page(self):
        item = listing()
        html = f'...{{"url":"{item["url"]}"}}...'
        self.assertEqual(freshness.missing_listings([item], html), [])

    def test_listing_is_missing_when_neither_url_nor_title_appears(self):
        item = listing()
        self.assertEqual(
            freshness.missing_listings([item], "<html>nothing here</html>"),
            [item],
        )

    def test_title_is_the_fallback_when_the_url_is_absent(self):
        """A listing can render without its raw URL in the payload.

        Falling back to the title keeps that from being reported as missing -
        the false positive that would make this check untrustworthy.
        """
        item = listing()
        html = "<h3>Example Hackathon 2026</h3>"
        self.assertEqual(freshness.missing_listings([item], html), [])

    def test_a_listing_with_no_url_and_no_title_is_reported_missing(self):
        """Never silently pass a listing there is no way to look for.

        Returning "present" for an unidentifiable listing is the false negative
        this whole script exists to prevent, so the unmatchable case must fail
        loudly rather than be skipped.
        """
        item = listing(url="", title="")
        self.assertEqual(freshness.missing_listings([item], "anything"), [item])

    def test_only_the_missing_ones_are_returned(self):
        here = listing(id="1", title="Present One", url="https://present.example/")
        gone = listing(id="2", title="Absent One", url="https://absent.example/")
        html = "https://present.example/"
        self.assertEqual(freshness.missing_listings([here, gone], html), [gone])

    def test_matching_is_substring_based_not_exact(self):
        """The URL is embedded in a much larger RSC payload, not alone."""
        item = listing()
        html = 'x' * 5000 + f'\\"url\\":\\"{item["url"]}\\"' + 'y' * 5000
        self.assertEqual(freshness.missing_listings([item], html), [])


class Configuration(unittest.TestCase):
    def test_site_url_has_no_trailing_slash(self):
        """fetch_site appends "/", so a trailing slash here would request "//"."""
        self.assertFalse(freshness.SITE_URL.endswith("/"))

    def test_request_headers_look_like_a_browser(self):
        """Clerk answers non-document requests differently.

        Without an HTML Accept header the middleware returns a handshake or a
        404 rather than the page a visitor gets, and this check would be
        reasoning about a response no real user ever sees.
        """
        self.assertIn("text/html", freshness.HEADERS["accept"])
        self.assertIn("Mozilla/5.0", freshness.HEADERS["user-agent"])


if __name__ == "__main__":
    unittest.main()
