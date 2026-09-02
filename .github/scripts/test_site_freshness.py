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


class ExactComparison(unittest.TestCase):
    """The preferred path: ids and visible fields against /site-data/listings.json."""

    def test_identical_snapshots_report_nothing(self):
        repo = [listing(id="a"), listing(id="b", title="Other")]
        live = [dict(x) for x in repo]
        self.assertEqual(
            freshness.diff_listings(repo, live), {"missing": [], "stale": [], "extra": []}
        )

    def test_a_listing_added_after_the_build_is_missing(self):
        old = listing(id="a")
        new = listing(id="b", title="Added Later")
        diff = freshness.diff_listings([old, new], [old])
        self.assertEqual(diff["missing"], [new])
        self.assertEqual(diff["stale"], [])

    def test_a_listing_closed_after_the_build_is_stale(self):
        """The case the textual check could never see: the URL is still on the
        page, but the site says OPEN while the repository says closed."""
        live = listing(id="a", state="open", active=True)
        repo = listing(id="a", state="closed", active=False)
        diff = freshness.diff_listings([repo], [live])
        self.assertEqual(diff["stale"], [repo])
        self.assertEqual(diff["missing"], [])

    def test_date_updated_alone_is_not_staleness(self):
        live = listing(id="a", date_updated=1)
        repo = listing(id="a", date_updated=2)
        self.assertEqual(freshness.diff_listings([repo], [live])["stale"], [])

    def test_a_listing_removed_from_the_repo_is_extra(self):
        gone = listing(id="z", title="Rolled Back")
        diff = freshness.diff_listings([], [gone])
        self.assertEqual(diff["extra"], [gone])

    def test_url_split_across_rsc_chunks_is_not_a_false_positive_here(self):
        """The failure that motivated this path: the id comparison does not
        depend on where the HTML serializer broke a string."""
        item = listing(id="a", url="https://treehacks.com/")
        self.assertEqual(freshness.diff_listings([item], [dict(item)])["missing"], [])
        # ...whereas the textual fallback would report it missing.
        html = 'x\\"url\\":\\"https://treeh' + '"]);self.__next_f.push([1,"' + 'acks.com/\\"'
        self.assertEqual(freshness.missing_listings([item], html), [item])


class VisitorProbe(unittest.TestCase):
    """A browser-shaped GET / must get the page, and a Clerk dev handshake must
    be named as such rather than reported as a generic redirect or 500."""

    def test_200_is_ok(self):
        self.assertEqual(freshness.classify_document_response(200, ""), ("ok", ""))

    def test_redirect_to_a_clerk_dev_instance_is_named(self):
        verdict, detail = freshness.classify_document_response(
            307,
            "https://in-example-12.clerk.accounts.dev/v1/client/handshake?redirect_url=x",
        )
        self.assertEqual(verdict, "clerk_dev_instance")
        self.assertIn("clerk.accounts.dev", detail)
        self.assertNotIn("redirect_url", detail, "query string is noise in a summary")

    def test_other_redirects_are_reported_as_redirects(self):
        verdict, _ = freshness.classify_document_response(301, "https://www.example.com/")
        self.assertEqual(verdict, "redirect")

    def test_server_errors_are_errors(self):
        verdict, detail = freshness.classify_document_response(500, "")
        self.assertEqual(verdict, "error")
        self.assertIn("500", detail)

    def test_the_fix_text_names_the_cause(self):
        self.assertIn("pk_test_", freshness.CLERK_DEV_FIX)
        self.assertIn("Workers Builds", freshness.CLERK_DEV_FIX)


class CommitsBehind(unittest.TestCase):
    def test_unknown_sha_is_none(self):
        self.assertIsNone(freshness.commits_behind("unknown"))
        self.assertIsNone(freshness.commits_behind(""))

    def test_a_sha_git_has_never_seen_is_none_not_an_exception(self):
        self.assertIsNone(freshness.commits_behind("0" * 40))


class Configuration(unittest.TestCase):
    def test_site_url_has_no_trailing_slash(self):
        """fetch_site appends "/", so a trailing slash here would request "//"."""
        self.assertFalse(freshness.SITE_URL.endswith("/"))

    def test_request_headers_look_like_a_browser(self):
        """Clerk answers non-document requests differently.

        Without an HTML Accept header the middleware never starts a handshake,
        so the visitor probe would pass a deployment that bounces every real
        visitor into a development instance.
        """
        self.assertIn("text/html", freshness.HEADERS["accept"])
        self.assertIn("Mozilla/5.0", freshness.HEADERS["user-agent"])

    def test_data_requests_bypass_caches(self):
        """The data files are verified right after a deploy; a cached copy from
        before it would report the previous build as current."""
        self.assertEqual(freshness.DATA_HEADERS["cache-control"], "no-cache")


if __name__ == "__main__":
    unittest.main()
