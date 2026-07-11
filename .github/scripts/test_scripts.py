"""Unit tests for the hackathon automation scripts.

Run with:  python -m unittest discover -s .github/scripts -p 'test_*.py'
Covers the core parsing/validation helpers with happy-path + malformed input.
"""

import json
import os
import tempfile
import unittest
from datetime import date
from unittest import mock

import util
import auto_extract as ax
import deadline_watcher as dw


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


if __name__ == "__main__":
    unittest.main()
