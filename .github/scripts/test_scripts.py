"""Unit tests for the hackathon automation scripts.

Run with:  python -m unittest discover -s .github/scripts -p 'test_*.py'
Covers the core parsing/validation helpers with happy-path + malformed input.
"""

import json
import os
import tempfile
import unittest
from datetime import date, datetime
from unittest import mock

import util
import auto_extract as ax
import deadline_watcher as dw
import closing_soon as cs


class ParseDeadlineDate(unittest.TestCase):
    def test_iso_and_us_formats(self):
        self.assertEqual(util.parse_deadline_date("2026-07-04"), date(2026, 7, 4))
        self.assertEqual(util.parse_deadline_date("07/04/2026"), date(2026, 7, 4))

    def test_invalid_raises(self):
        with self.assertRaises(ValueError):
            util.parse_deadline_date("July 4th")
        with self.assertRaises(ValueError):
            util.parse_deadline_date("2026/07/04")


class SanitizeField(unittest.TestCase):
    def test_strips_control_chars_and_collapses_ws(self):
        self.assertEqual(util.sanitize_field('X";sh\nY'), 'X";sh Y')
        self.assertEqual(util.sanitize_field("  a   b  "), "a b")

    def test_handles_none_and_truncates(self):
        self.assertEqual(util.sanitize_field(None), "")
        self.assertEqual(len(util.sanitize_field("a" * 500, max_len=10)), 10)


class Email(unittest.TestCase):
    def test_valid(self):
        self.assertTrue(util.is_valid_email("me@example.com"))

    def test_invalid(self):
        self.assertFalse(util.is_valid_email("me@example.com\nx"))
        self.assertFalse(util.is_valid_email("not-an-email"))
        self.assertFalse(util.is_valid_email(""))


class EscapeAttr(unittest.TestCase):
    def test_escapes_quotes_and_angles(self):
        self.assertEqual(util.escape_attr('"><b>'), "&quot;&gt;&lt;b&gt;")


class ParseIssueBody(unittest.TestCase):
    def test_parses_field_sections(self):
        body = (
            "### Hackathon Name\nHackMIT 2026\n\n"
            "### Link to Hackathon Page\nhttps://hackmit.org\n"
        )
        data = util.parse_issue_body(body)
        self.assertEqual(data["hackathon_name"], "HackMIT 2026")
        self.assertEqual(data["link_to_hackathon_page"], "https://hackmit.org")

    def test_skips_no_response_placeholder(self):
        data = util.parse_issue_body("### Prize Pool (optional)\n_No response_\n")
        self.assertFalse(data.get("prize_pool_(optional)"))

    def test_strip_symbols_normalizes_keys(self):
        data = util.parse_issue_body("### Deadline (optional)\n2026-07-04\n", strip_symbols=True)
        self.assertEqual(data.get("deadline_optional"), "2026-07-04")


class ParseStateAndDeadline(unittest.TestCase):
    def test_state(self):
        self.assertEqual(util.parse_state({"status": "Opens soon"}), "opens_soon")
        self.assertEqual(util.parse_state({"status": "Open now"}), "open")
        self.assertEqual(util.parse_state({}), "open")

    def test_deadline(self):
        self.assertEqual(
            util.parse_deadline({"deadline": "2026-07-04"}, "deadline"), "2026-07-04"
        )
        self.assertIsNone(util.parse_deadline({}, "deadline"))


class CleanUrl(unittest.TestCase):
    def test_empty_returns_empty(self):
        # Must not manufacture "https://" out of nothing (issue #73).
        self.assertEqual(util.clean_url(""), "")

    def test_whitespace_returns_empty(self):
        self.assertEqual(util.clean_url("   "), "")

    def test_host_less_scheme_returns_empty(self):
        self.assertEqual(util.clean_url("https://"), "")
        self.assertEqual(util.clean_url("http://"), "")

    def test_valid_host_normalizes(self):
        self.assertEqual(util.clean_url("example.com"), "https://example.com")

    def test_strips_tracking_params(self):
        self.assertEqual(
            util.clean_url("https://example.com/e?utm_source=x&a=1"),
            "https://example.com/e?a=1",
        )


class ContributionApprovedUrlGuard(unittest.TestCase):
    def test_bare_scheme_url_is_rejected(self):
        # A host-less scheme is truthy (passes the raw check) but clean_url
        # reduces it to "", which must not be written as an empty-url listing.
        import contribution_approved as ca
        data = {
            "link_to_hackathon_page": "https://",
            "hackathon_name": "X",
            "host_organizer": "Y",
        }
        with self.assertRaises(SystemExit):  # util.fail -> exit(1)
            ca.handle_new_opportunity(data, "tester")


class SsrfGuard(unittest.TestCase):
    def test_blocks_internal_hosts(self):
        for host in ("127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1"):
            ok, _ = ax._resolved_ips_are_public(host)
            self.assertFalse(ok, f"{host} should be blocked")

    def test_rejects_non_http_scheme(self):
        ok, _ = ax._validate_fetch_url("file:///etc/passwd")
        self.assertFalse(ok)


class DeadlineWatcherRules(unittest.TestCase):
    def _base(self, **over):
        d = {
            "found": True,
            "deadline": "2026-08-01",
            "deadline_type": "application",
            "confidence": "high",
            "evidence": "Applications close August 1, 2026",
        }
        d.update(over)
        return d

    def test_accepts_high_confidence_application(self):
        self.assertEqual(
            dw._accept(self._base(), today=date(2026, 7, 1)),
            ("2026-08-01", "Applications close August 1, 2026"),
        )

    def test_rejects_past_deadline(self):
        # High confidence + participant-facing, but the date is already past
        # relative to the run date, so it must not become a proposal.
        self.assertIsNone(dw._accept(self._base(), today=date(2026, 12, 1)))

    def test_rejects_low_confidence(self):
        self.assertIsNone(dw._accept(self._base(confidence="medium")))

    def test_rejects_non_participant_deadline(self):
        self.assertIsNone(dw._accept(self._base(deadline_type="other")))

    def test_rejects_missing_evidence(self):
        self.assertIsNone(dw._accept(self._base(evidence="")))

    def test_rejects_not_found_or_bad_date(self):
        self.assertIsNone(dw._accept(self._base(found=False)))
        self.assertIsNone(dw._accept(self._base(deadline="sometime in August")))


class DeadlineWatcherReport(unittest.TestCase):
    def test_build_report_sanitizes_url(self):
        report = dw._build_report(
            [
                {
                    "id": "abc",
                    "company": "Acme",
                    "title": "Hack",
                    "url": "https://example.com\n@mention",
                    "deadline": "2026-08-01",
                    "type": "application",
                    "evidence": "Applications close August 1, 2026",
                }
            ]
        )
        self.assertIn("https://example.com @mention", report)
        self.assertNotIn("\n@mention", report)


class SaveListingsAtomic(unittest.TestCase):
    def test_round_trip_and_no_temp_files(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            data = [{"id": "a", "n": 1}, {"id": "b", "n": 2}]
            with mock.patch.object(util, "LISTINGS_FILE", path):
                util.save_listings_to_json(data)
                self.assertEqual(util.get_listings_from_json(), data)
            with open(path) as f:
                written = f.read()
            # Content is exactly what was intended after the atomic replace.
            self.assertEqual(json.loads(written), data)
            self.assertEqual(written, json.dumps(data, indent=2))
            # No temp files left behind in the target directory.
            leftovers = [n for n in os.listdir(d) if n != "listings.json"]
            self.assertEqual(leftovers, [], f"temp files left behind: {leftovers}")

    def test_replace_overwrites_existing_file(self):
        # A second save fully replaces the first (atomic swap, not append).
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with mock.patch.object(util, "LISTINGS_FILE", path):
                util.save_listings_to_json([{"id": "old"}])
                util.save_listings_to_json([{"id": "new"}])
                self.assertEqual(util.get_listings_from_json(), [{"id": "new"}])
            leftovers = [n for n in os.listdir(d) if n != "listings.json"]
            self.assertEqual(leftovers, [], f"temp files left behind: {leftovers}")


class GetListingsCorrupt(unittest.TestCase):
    def test_corrupt_file_raises_clear_error(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with open(path, "w") as f:
                f.write('[{"id": "a"} {"id": "b"}]')  # missing comma -> invalid
            with mock.patch.object(util, "LISTINGS_FILE", path):
                with self.assertRaises(ValueError) as ctx:
                    util.get_listings_from_json()
            msg = str(ctx.exception)
            # Error names the file and is our wrapped error, not a raw traceback.
            self.assertIn(path, msg)
            self.assertNotIsInstance(ctx.exception, json.JSONDecodeError)

    def test_missing_file_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "does_not_exist.json")
            with mock.patch.object(util, "LISTINGS_FILE", path):
                self.assertEqual(util.get_listings_from_json(), [])


class CheckSchemaCollectsAll(unittest.TestCase):
    def _valid(self, **over):
        listing = {field: "x" for field in util.REQUIRED_FIELDS}
        listing.update(over)
        return listing

    def test_valid_listings_pass(self):
        self.assertTrue(util.check_schema([self._valid(id="ok")]))

    def test_reports_all_invalid_entries(self):
        bad_missing = self._valid(id="bad1")
        del bad_missing["url"]
        del bad_missing["prize"]
        bad_deadline = self._valid(id="bad2", deadline="not-a-date")
        bad_featured = self._valid(id="bad3", featured="yes")
        with self.assertRaises(ValueError) as ctx:
            util.check_schema(
                [self._valid(id="good"), bad_missing, bad_deadline, bad_featured]
            )
        msg = str(ctx.exception)
        # Every invalid entry is reported, not just the first.
        self.assertIn("bad1", msg)
        self.assertIn("bad2", msg)
        self.assertIn("bad3", msg)
        # Missing field names are surfaced; the valid entry is not flagged.
        self.assertIn("url", msg)
        self.assertIn("prize", msg)
        self.assertNotIn("good", msg)

    def test_partition_splits_valid_and_errors(self):
        good = self._valid(id="good")
        bad = self._valid(id="bad")
        del bad["url"]
        valid, errors = util.partition_valid_listings([good, bad])
        self.assertEqual(valid, [good])
        self.assertTrue(any("bad" in e and "url" in e for e in errors))


class UpdateReadmesSkipsBadRows(unittest.TestCase):
    """A single malformed listing must not block regeneration (issue #75 AC#4)."""

    def _valid(self, **over):
        listing = {field: "x" for field in util.REQUIRED_FIELDS}
        listing.update(over)
        return listing

    def test_one_bad_listing_does_not_block_regeneration(self):
        import update_readmes
        good = self._valid(
            id="good", company_name="Good Co", title="Good Hack",
            date_posted=1783771200, locations=["Troy, NY"], state="open",
        )
        bad = self._valid(id="bad")
        del bad["url"]  # missing a required field
        with mock.patch.object(util, "get_listings_from_json", return_value=[good, bad]), \
                mock.patch.object(util, "embed_table") as embed, \
                mock.patch.object(util, "set_output"), \
                mock.patch("generate_banner.main"), \
                mock.patch("generate_gallery.main"), \
                mock.patch.object(util, "warn") as warn:
            update_readmes.main()
        # Regeneration ran for the good listing despite the bad one (no hard fail).
        embed.assert_called_once()
        table = embed.call_args[0][1]
        self.assertIn("Good Hack", table)
        # The malformed listing surfaced as a warning, not an abort.
        self.assertTrue(any("bad" in str(c) for c in warn.call_args_list))


class ClosingSoonDeadlineCell(unittest.TestCase):
    """Regression tests for issue #70.

    The closing-soon badge must be derived from the Deadline cell alone, never
    from event dates that live in the Hackathon title (or any other) cell.
    """

    # Today is 1 day before cuHacking's *event* end date (Jul 12, 2026) — the
    # date the old code harvested out of the title and mistook for a deadline.
    TODAY = datetime(2026, 7, 11, tzinfo=cs.PST)

    def test_event_date_in_title_with_dash_deadline_stays_open(self):
        # Exact cuHacking-style row from issue #70: event dates in the title,
        # "—" (no deadline) in the Deadline cell. Must NOT become CLOSING SOON.
        row = (
            "| ✅ **[OPEN]** | Carleton University | "
            "cuHacking 2026 — Jul 10 – Jul 12, 2026 | In-Person | Ottawa, ON | "
            "TBA | — | "
            '<a href="https://cuhacking.ca"><img '
            'src="https://img.shields.io/badge/Register-blue?style=for-the-badge" '
            'alt="Register"></a> | Jul 03, 2026 |'
        )
        new_row, changed = cs.update_row(row, self.TODAY)
        self.assertFalse(changed)
        self.assertEqual(new_row, row)
        self.assertIn(cs.OPEN, new_row)
        self.assertNotIn(cs.CLOSING, new_row)

    def test_real_deadline_within_seven_days_becomes_closing_soon(self):
        # Deadline Jul 15, 2026 is 4 days from TODAY -> CLOSING SOON. The far-off
        # event date (Aug 20) in the title must be ignored entirely.
        row = (
            "| ✅ **[OPEN]** | Some Org | Some Hack — Aug 20, 2026 | Online | "
            "Remote | $10k | Jul 15, 2026 | "
            '<a href="https://example.org">Register</a> | Jul 01, 2026 |'
        )
        new_row, changed = cs.update_row(row, self.TODAY)
        self.assertTrue(changed)
        self.assertIn(cs.CLOSING, new_row)
        self.assertNotIn(cs.OPEN, new_row)

    def test_real_deadline_beyond_seven_days_stays_open(self):
        # Deadline Aug 20 is > 7 days away; title event date is irrelevant.
        row = (
            "| ✅ **[OPEN]** | Some Org | Some Hack — Jul 12, 2026 | Online | "
            "Remote | $10k | Aug 20, 2026 | "
            '<a href="https://example.org">Register</a> | Jul 01, 2026 |'
        )
        new_row, changed = cs.update_row(row, self.TODAY)
        self.assertFalse(changed)
        self.assertEqual(new_row, row)


if __name__ == "__main__":
    unittest.main()
