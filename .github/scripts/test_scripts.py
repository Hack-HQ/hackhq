"""Unit tests for the hackathon automation scripts.

Run with:  python -m unittest discover -s .github/scripts -p 'test_*.py'
Covers the core parsing/validation helpers with happy-path + malformed input.
"""

import unittest
from datetime import date

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


if __name__ == "__main__":
    unittest.main()
