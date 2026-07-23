"""Unit tests for the hackathon automation scripts.

Run with:  python -m unittest discover -s .github/scripts -p 'test_*.py'
Covers the core parsing/validation helpers with happy-path + malformed input.
"""

import json
import os
import socket
import tempfile
import unittest
from datetime import date, datetime, timezone
from unittest import mock
from urllib.parse import urlparse

import requests

import util
import auto_extract as ax
import deadline_watcher as dw
import seed_supabase as seed
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

    def test_generic_date_field(self):
        self.assertEqual(
            util.parse_date_field({"start_date": "09/12/2026"}, "start date", "start_date"),
            "2026-09-12",
        )


class ResolveState(unittest.TestCase):
    def test_active_false_overrides_open_state(self):
        listing = {"state": "open", "active": False}
        self.assertEqual(util.resolve_state(listing), "closed")

    def test_active_false_overrides_opens_soon_state(self):
        listing = {"state": "opens_soon", "active": False}
        self.assertEqual(util.resolve_state(listing), "closed")

    def test_explicit_closed_state(self):
        self.assertEqual(util.resolve_state({"state": "closed", "active": True}), "closed")

    def test_active_true_honors_stored_state(self):
        self.assertEqual(util.resolve_state({"state": "opens_soon", "active": True}), "opens_soon")


class CloseOpportunityState(unittest.TestCase):
    """Closing a listing must set canonical structured state, not just active."""

    def _listing(self, **over):
        base = {field: "x" for field in util.REQUIRED_FIELDS}
        base.update(
            {
                "id": "test-id",
                "company_name": "MIT",
                "title": "HackMIT 2026",
                "url": "https://hackmit.org/",
                "locations": ["Cambridge, MA"],
                "format": "In-Person",
                "prize": "$20K",
                "state": "open",
                "active": True,
                "is_visible": True,
                "date_posted": 1,
                "date_updated": 1,
                "source": "tester",
            }
        )
        base.update(over)
        return base

    def test_close_sets_state_and_active(self):
        import contribution_approved as ca

        listing = self._listing()
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with open(path, "w") as f:
                json.dump([listing], f)
            with mock.patch.object(util, "LISTINGS_FILE", path), \
                    mock.patch.object(util, "set_output"):
                ca.handle_close_opportunity(
                    {
                        "host/organizer_name": "MIT",
                        "hackathon_name": "HackMIT 2026",
                    },
                    "maintainer",
                )
            with open(path) as f:
                saved = json.load(f)[0]
        self.assertFalse(saved["active"])
        self.assertEqual(saved["state"], "closed")
        self.assertEqual(util.resolve_state(saved), "closed")

    def test_close_from_opens_soon_is_idempotent(self):
        import contribution_approved as ca

        listing = self._listing(state="opens_soon")
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with open(path, "w") as f:
                json.dump([listing], f)
            with mock.patch.object(util, "LISTINGS_FILE", path), \
                    mock.patch.object(util, "set_output"):
                ca.handle_close_opportunity(
                    {
                        "host/organizer_name": "MIT",
                        "hackathon_name": "HackMIT 2026",
                    },
                    "maintainer",
                )
                ca.handle_close_opportunity(
                    {
                        "host/organizer_name": "MIT",
                        "hackathon_name": "HackMIT 2026",
                    },
                    "maintainer",
                )
            with open(path) as f:
                saved = json.load(f)[0]
        self.assertEqual(saved["state"], "closed")
        self.assertFalse(saved["active"])


class SplitTableCells(unittest.TestCase):
    def test_escaped_pipe_stays_in_one_cell(self):
        row = (
            "| ✅ **[OPEN]** | Foo \\| Bar | Some Hack | In-Person | "
            "Boston, MA | $10k | Jul 15, 2026 | "
            '<a href="https://example.org">Register</a> | Jul 01, 2026 |'
        )
        cells = util.split_table_cells(row)
        self.assertEqual(cells[1], "Foo | Bar")
        self.assertEqual(cells[2], "Some Hack")
        self.assertEqual(cells[6], "Jul 15, 2026")

    def test_ordinary_row_unchanged(self):
        row = (
            "| ✅ **[OPEN]** | MIT | HackMIT 2026 | In-Person | Cambridge, MA | "
            "$20K | Jul 04, 2026 | <a href=\"https://hackmit.org/\">Register</a> | "
            "Jun 27, 2026 |"
        )
        cells = util.split_table_cells(row)
        self.assertEqual(cells[1], "MIT")
        self.assertEqual(cells[2], "HackMIT 2026")


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


class ContributionApprovedEventDates(unittest.TestCase):
    def test_manual_submission_persists_event_dates(self):
        import contribution_approved as ca

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with mock.patch.object(util, "LISTINGS_FILE", path), \
                    mock.patch.object(util, "set_output"), \
                    mock.patch.object(util, "generate_uuid", return_value="new-id"), \
                    mock.patch.object(util, "get_current_timestamp", return_value=1):
                ca.handle_new_opportunity(
                    {
                        "link_to_hackathon_page": "https://hackmit.org/",
                        "host/organizer": "MIT",
                        "hackathon_name": "HackMIT 2026",
                        "format": "In-Person",
                        "location": "Cambridge, MA",
                        "deadline": "2026-07-04",
                        "start_date_(optional)": "09/12/2026",
                        "end_date_(optional)": "09/14/2026",
                    },
                    "tester",
                )
            with open(path) as f:
                saved = json.load(f)[0]

        self.assertEqual(saved["startDate"], "2026-09-12")
        self.assertEqual(saved["endDate"], "2026-09-14")


class SsrfGuard(unittest.TestCase):
    def test_blocks_internal_hosts(self):
        for host in ("127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1"):
            ok, _ = ax._resolved_ips_are_public(host)
            self.assertFalse(ok, f"{host} should be blocked")

    def test_blocks_cgnat_and_benchmark_ranges(self):
        # A bare private/loopback/... denylist misses CGNAT (100.64.0.0/10) and
        # benchmark (198.18.0.0/15); the is_global allowlist catches them.
        for host in ("100.64.0.1", "198.18.0.5"):
            ok, _ = ax._resolved_ips_are_public(host)
            self.assertFalse(ok, f"{host} should be blocked")

    def test_rejects_non_http_scheme(self):
        ok, _ = ax._validate_fetch_url("file:///etc/passwd")
        self.assertFalse(ok)


class ResponseSizeCap(unittest.TestCase):
    """Fetch caps the body to defeat multi-GB responses / compression bombs."""

    class _FakeResp:
        def __init__(self, chunks, headers=None):
            self._chunks = chunks
            self.headers = headers or {}
            self.closed = False
            self._content = None
            self._content_consumed = False

        def iter_content(self, chunk_size=65536):
            yield from self._chunks

        def close(self):
            self.closed = True

    def test_reads_body_under_cap(self):
        resp = self._FakeResp([b"a" * 100, b"b" * 100])
        out = ax._read_capped(resp, max_bytes=1000)
        self.assertEqual(out._content, b"a" * 100 + b"b" * 100)
        self.assertTrue(out._content_consumed)

    def test_rejects_body_over_cap(self):
        # Simulates a decompression bomb: chunks (already decompressed by
        # requests) accumulate past the cap.
        resp = self._FakeResp([b"x" * 600, b"x" * 600])
        with self.assertRaises(ValueError):
            ax._read_capped(resp, max_bytes=1000)
        self.assertTrue(resp.closed)

    def test_rejects_declared_content_length_over_cap(self):
        resp = self._FakeResp([b"x"], headers={"Content-Length": str(10_000)})
        with self.assertRaises(ValueError):
            ax._read_capped(resp, max_bytes=1000)
        self.assertTrue(resp.closed)


class SsrfDnsRebinding(unittest.TestCase):
    """Regression tests for the check-then-connect (TOCTOU) SSRF gap, issue #74."""

    @staticmethod
    def _addrinfo(ip):
        """A getaddrinfo-shaped result for a single address."""
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (ip, 0))]

    def test_rejects_rebind_to_private_ip(self):
        # Resolver answers the validation with a public IP and the re-check with
        # the cloud metadata endpoint: the fetch must be refused, never performed.
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            side_effect=[self._addrinfo("93.184.216.34"), self._addrinfo("169.254.169.254")],
        ) as m:
            with self.assertRaises(ValueError):
                ax.safe_get("https://victim.example", headers={})
        # Only the two resolver calls happened — no socket connection was attempted.
        self.assertEqual(m.call_count, 2)

    def test_rejects_address_set_change_between_check_and_connect(self):
        # Even when both answers are public, a changed address set means the host
        # rebound between check and connect, so we refuse rather than connect.
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            side_effect=[self._addrinfo("93.184.216.34"), self._addrinfo("203.0.113.7")],
        ) as m:
            with self.assertRaises(ValueError):
                ax.safe_get("https://victim.example", headers={})
        self.assertEqual(m.call_count, 2)

    def test_validate_and_pin_accepts_stable_public_ip(self):
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            return_value=self._addrinfo("93.184.216.34"),
        ):
            ok, reason, host, ip_set, pinned = ax._validate_and_pin("https://good.example/path")
        self.assertTrue(ok, reason)
        self.assertEqual(host, "good.example")
        self.assertEqual(pinned, "93.184.216.34")
        self.assertIn("93.184.216.34", ip_set)

    def test_safe_get_pins_stable_public_ip(self):
        # A stable public IP passes the guard: safe_get builds a pinned session
        # and performs the fetch (transport mocked so no real network I/O).
        fake = mock.Mock(is_redirect=False, status_code=200)
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            return_value=self._addrinfo("93.184.216.34"),
        ), mock.patch("auto_extract._get_with_retries", return_value=fake) as get:
            out = ax.safe_get("https://good.example/path", headers={})
        self.assertIs(out, fake)
        session = get.call_args[0][0]
        adapter = session.get_adapter("https://good.example/path")
        self.assertIsInstance(adapter, ax._PinnedIPAdapter)

    def test_adapter_dials_ip_but_keeps_host_and_sni(self):
        # The connection is dialed at the validated IP, while the Host header, TLS
        # SNI and certificate hostname stay bound to the original hostname.
        adapter = ax._PinnedIPAdapter("good.example", "93.184.216.34")
        prepared = requests.Request(
            "GET", "https://good.example/path", headers={"User-Agent": "x"}
        ).prepare()
        with mock.patch("requests.adapters.HTTPAdapter.send", return_value="sent") as send:
            out = adapter.send(prepared)
        self.assertEqual(out, "sent")
        dialed = send.call_args[0][0]
        self.assertEqual(urlparse(dialed.url).hostname, "93.184.216.34")
        self.assertEqual(dialed.headers["Host"], "good.example")
        pool_kw = adapter.poolmanager.connection_pool_kw
        self.assertEqual(pool_kw["server_hostname"], "good.example")
        self.assertEqual(pool_kw["assert_hostname"], "good.example")

    def test_idna_ascii_normalizes_unicode_host(self):
        # requests puts the punycode form on the wire, so the pin must be stored
        # in that same ASCII form or an IDN host silently bypasses the guard.
        self.assertEqual(ax._idna_ascii("münchen.de"), "xn--mnchen-3ya.de")
        self.assertEqual(ax._idna_ascii("EXAMPLE.com"), "example.com")  # ascii, lowercased
        with self.assertRaises(ValueError):
            ax._idna_ascii("ÿ" * 100)  # invalid (over-long) international label

    def test_validate_and_pin_normalizes_idn_host(self):
        # An internationalized hostname is normalized to punycode before resolve
        # and pin, so the adapter's later comparison against the (punycode) request
        # URL matches and the connection is actually pinned rather than bypassed.
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            return_value=self._addrinfo("93.184.216.34"),
        ):
            ok, reason, host, ip_set, pinned = ax._validate_and_pin("http://münchen.de/")
        self.assertTrue(ok, reason)
        self.assertEqual(host, "xn--mnchen-3ya.de")

    def test_safe_get_pins_idn_host_not_bypassed(self):
        # Full path: an IDN host must be fetched through a session pinned to the
        # punycode host, not forwarded unpinned (which re-resolves DNS on the wire).
        fake = mock.Mock(is_redirect=False, status_code=200)
        with mock.patch(
            "auto_extract.socket.getaddrinfo",
            return_value=self._addrinfo("93.184.216.34"),
        ), mock.patch("auto_extract._get_with_retries", return_value=fake) as get:
            ax.safe_get("http://münchen.de/path", headers={})
        session = get.call_args[0][0]
        adapter = session.get_adapter("http://xn--mnchen-3ya.de/path")
        self.assertIsInstance(adapter, ax._PinnedIPAdapter)
        self.assertEqual(adapter._pinned_host, "xn--mnchen-3ya.de")

    def test_adapter_fails_closed_on_host_mismatch(self):
        # If the prepared request's host is not the pinned host, the adapter must
        # refuse rather than forward it unpinned (the fail-open TOCTOU hole).
        adapter = ax._PinnedIPAdapter("good.example", "93.184.216.34")
        prepared = requests.Request(
            "GET", "https://evil.example/path", headers={"User-Agent": "x"}
        ).prepare()
        with mock.patch("requests.adapters.HTTPAdapter.send", return_value="sent") as send:
            with self.assertRaises(ValueError):
                adapter.send(prepared)
        send.assert_not_called()


class AutoExtractEventDates(unittest.TestCase):
    def test_parses_valid_ai_event_dates(self):
        extracted = {"startDate": "2026-09-12", "endDate": "09/14/2026"}
        self.assertEqual(
            ax._parse_extracted_event_date(extracted, "startDate"), "2026-09-12"
        )
        self.assertEqual(
            ax._parse_extracted_event_date(extracted, "endDate"), "2026-09-14"
        )

    def test_ignores_invalid_ai_event_dates(self):
        with mock.patch.object(util, "warn") as warn:
            self.assertIsNone(
                ax._parse_extracted_event_date({"startDate": "September"}, "startDate")
            )
        warn.assert_called_once()


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


class BuildRow(unittest.TestCase):
    def _listing(self, **overrides):
        base = {
            "id": "c0182709-2212-41a1-94ef-47689f05192f",
            "company_name": "MIT",
            "title": "HackMIT 2026",
            "url": "https://hackmit.org/",
        }
        base.update(overrides)
        return base

    def test_renames_company_name_to_host(self):
        row = seed.build_row(self._listing())
        self.assertEqual(row["host"], "MIT")
        self.assertNotIn("company_name", row)

    def test_defaults_for_absent_optional_fields(self):
        row = seed.build_row(self._listing())
        self.assertEqual(row["locations"], [])
        self.assertIsNone(row["deadline"])
        self.assertFalse(row["featured"])
        self.assertTrue(row["active"])
        self.assertTrue(row["is_visible"])

    def test_passes_through_deadline_and_featured(self):
        row = seed.build_row(self._listing(deadline="2026-07-05", featured=True))
        self.assertEqual(row["deadline"], "2026-07-05")
        self.assertTrue(row["featured"])

    def test_passes_through_event_dates_for_supabase(self):
        row = seed.build_row(
            self._listing(startDate="2026-09-12", endDate="2026-09-14")
        )
        self.assertEqual(row["startDate"], "2026-09-12")
        self.assertEqual(row["endDate"], "2026-09-14")

    def test_omits_geo_columns_for_geocoder(self):
        row = seed.build_row(self._listing())
        for column in ("lat", "lng", "geo_status"):
            self.assertNotIn(column, row)

    def test_sends_synced_at_so_the_upsert_refreshes_it(self):
        # Without this key the column keeps the DEFAULT now() from the row's
        # first insert forever - the upsert's UPDATE path never writes it.
        row = seed.build_row(self._listing(), synced_at="2026-07-22T19:07:41+00:00")
        self.assertEqual(row["synced_at"], "2026-07-22T19:07:41+00:00")

    def test_synced_at_defaults_to_now(self):
        before = datetime.now(timezone.utc)
        stamped = datetime.fromisoformat(seed.build_row(self._listing())["synced_at"])
        after = datetime.now(timezone.utc)
        self.assertIsNotNone(stamped.tzinfo)
        self.assertLessEqual(before, stamped)
        self.assertLessEqual(stamped, after)

    def test_one_run_stamps_every_row_with_the_same_instant(self):
        listings = [self._listing(), self._listing(title="Other")]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "listings.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(listings, handle)
            captured = []
            env = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_KEY": "k"}
            with mock.patch.dict(os.environ, env, clear=False), mock.patch.object(
                seed, "LISTINGS_FILE", path
            ), mock.patch.object(seed, "upsert", lambda rows, *a: captured.extend(rows)):
                seed.main()
        self.assertEqual(len(captured), 2)
        self.assertEqual(captured[0]["synced_at"], captured[1]["synced_at"])
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
        bad_start = self._valid(id="bad4", startDate="next Friday")
        with self.assertRaises(ValueError) as ctx:
            util.check_schema(
                [self._valid(id="good"), bad_missing, bad_deadline, bad_featured, bad_start]
            )
        msg = str(ctx.exception)
        # Every invalid entry is reported, not just the first.
        self.assertIn("bad1", msg)
        self.assertIn("bad2", msg)
        self.assertIn("bad3", msg)
        self.assertIn("bad4", msg)
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
        # Two tables are written now: README (live) and ARCHIVE (closed).
        self.assertEqual(embed.call_count, 2)
        table = embed.call_args_list[0][0][1]
        self.assertIn("Good Hack", table)
        # The malformed listing surfaced as a warning, not an abort.
        self.assertTrue(any("bad" in str(c) for c in warn.call_args_list))


class ClosedListingsAreArchived(unittest.TestCase):
    """Closed hackathons belong in ARCHIVE.md, never the README table."""

    def _valid(self, **over):
        listing = {field: "x" for field in util.REQUIRED_FIELDS}
        listing.update(over)
        return listing

    def _run(self, listings):
        import update_readmes
        with mock.patch.object(util, "get_listings_from_json", return_value=listings), \
                mock.patch.object(util, "embed_table") as embed, \
                mock.patch.object(util, "set_output"), \
                mock.patch("generate_banner.main"), \
                mock.patch("generate_gallery.main"):
            update_readmes.main()
        # (readme_call, archive_call) -> the embedded table text of each
        return embed.call_args_list[0][0][1], embed.call_args_list[1][0][1]

    def test_closed_goes_to_archive_and_live_stays_in_readme(self):
        live = self._valid(
            id="a", company_name="Live Co", title="Live Hack",
            date_posted=1783771200, locations=["Troy, NY"], state="open",
        )
        closed = self._valid(
            id="b", company_name="Done Co", title="Done Hack",
            date_posted=1783771200, locations=["Boston, MA"], state="closed",
            active=False,
        )
        readme, archive = self._run([live, closed])

        self.assertIn("Live Hack", readme)
        self.assertNotIn("Done Hack", readme)
        self.assertIn("Done Hack", archive)
        self.assertNotIn("Live Hack", archive)

    def test_active_false_is_archived_even_without_closed_state(self):
        # resolve_state treats active=False as closed; the split must agree.
        listing = self._valid(
            id="c", company_name="Done Co", title="Inactive Hack",
            date_posted=1783771200, locations=["Boston, MA"], state="open",
            active=False,
        )
        readme, archive = self._run([listing])

        self.assertNotIn("Inactive Hack", readme)
        self.assertIn("Inactive Hack", archive)

    def test_archive_rows_match_the_archive_header_width(self):
        import update_readmes
        listing = self._valid(
            id="d", company_name="Done Co", title="Done Hack",
            date_posted=1783771200, locations=["Boston, MA"], state="closed",
            active=False, format="In-Person",
        )
        lines = update_readmes.create_archive_table([listing]).split("\n")
        widths = {len(l.split("|")) for l in lines}
        self.assertEqual(len(widths), 1, f"ragged archive table: {lines}")
        self.assertIn(":lock:", lines[-1])


class ListingsFileOrder(unittest.TestCase):
    """listings.json is stored sorted so concurrent additions don't collide."""

    def _l(self, **over):
        listing = {field: "x" for field in util.REQUIRED_FIELDS}
        listing.update(over)
        return listing

    def test_order_is_by_host_then_title_then_id(self):
        a = self._l(id="3", company_name="Zeta U", title="A Hack")
        b = self._l(id="1", company_name="Alpha U", title="B Hack")
        c = self._l(id="2", company_name="Alpha U", title="A Hack")
        out = util.listings_file_order([a, b, c])
        self.assertEqual([l["id"] for l in out], ["2", "1", "3"])

    def test_order_is_stable_and_idempotent(self):
        ls = [self._l(id=str(i), company_name=f"U{i%3}", title=f"T{i}") for i in range(10)]
        once = util.listings_file_order(ls)
        twice = util.listings_file_order(once)
        self.assertEqual([l["id"] for l in once], [l["id"] for l in twice])

    def test_case_insensitive_host_ordering(self):
        a = self._l(id="1", company_name="beta U", title="T")
        b = self._l(id="2", company_name="Alpha U", title="T")
        self.assertEqual([l["id"] for l in util.listings_file_order([a, b])], ["2", "1"])

    def test_new_listing_is_not_appended_to_the_end(self):
        # The regression this guards: every new listing landing on the final
        # lines is what made concurrent listing PRs conflict by construction.
        existing = [self._l(id=str(i), company_name=f"U{i}", title="T") for i in range(1, 5)]
        newcomer = self._l(id="9", company_name="Aaa U", title="T")
        out = util.listings_file_order(existing + [newcomer])
        self.assertEqual(out[0]["id"], "9")
        self.assertNotEqual(out[-1]["id"], "9")

    def test_save_writes_canonical_order(self):
        ls = [
            self._l(id="2", company_name="Zeta U", title="T"),
            self._l(id="1", company_name="Alpha U", title="T"),
        ]
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "listings.json")
            with mock.patch.object(util, "LISTINGS_FILE", path):
                util.save_listings_to_json(ls)
                written = json.load(open(path))
        self.assertEqual([l["id"] for l in written], ["1", "2"])


class ResolveDataMerge(unittest.TestCase):
    """Conflicted data files resolve by union — a merge never drops a listing."""

    def _l(self, **over):
        listing = {field: "x" for field in util.REQUIRED_FIELDS}
        listing.update(over)
        return listing

    def test_union_keeps_both_sides_new_listings(self):
        import resolve_data_merge as r
        base = [self._l(id="a"), self._l(id="b")]
        ours = base + [self._l(id="mine", title="My Hack")]
        theirs = base + [self._l(id="theirs", title="Their Hack")]
        merged, added = r.merge_listings(ours, theirs)
        self.assertEqual({l["id"] for l in merged}, {"a", "b", "mine", "theirs"})
        self.assertEqual([l["id"] for l in added], ["mine"])

    def test_shared_records_take_the_incoming_version(self):
        # main is authoritative for listings it already has, so a stale copy on
        # the PR branch must not revert it (e.g. a close applied on main).
        import resolve_data_merge as r
        ours = [self._l(id="a", state="open", active=True)]
        theirs = [self._l(id="a", state="closed", active=False)]
        merged, added = r.merge_listings(ours, theirs)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["state"], "closed")
        self.assertEqual(added, [])

    def test_union_never_shrinks(self):
        import resolve_data_merge as r
        ours = [self._l(id=str(i)) for i in range(5)]
        theirs = [self._l(id=str(i)) for i in range(3, 9)]
        merged, _ = r.merge_listings(ours, theirs)
        self.assertGreaterEqual(len(merged), max(len(ours), len(theirs)))
        self.assertEqual(len(merged), 9)

    def test_geocodes_union_keeps_both_cities_and_sorts(self):
        import resolve_data_merge as r
        ours = {"coordinates": {"zed, tx": [1, 2], "shared, ca": [9, 9]}, "unmappable": ["tba"]}
        theirs = {"coordinates": {"alpha, ny": [3, 4], "shared, ca": [5, 5]}, "unmappable": ["tba"]}
        merged, added = r.merge_geocodes(ours, theirs)
        self.assertEqual(list(merged["coordinates"]), ["alpha, ny", "shared, ca", "zed, tx"])
        self.assertEqual(merged["coordinates"]["shared, ca"], [5, 5])  # theirs wins
        self.assertEqual(added, ["zed, tx"])

    def test_geocodes_union_merges_unmappable(self):
        import resolve_data_merge as r
        ours = {"coordinates": {}, "unmappable": ["tba", "mine"]}
        theirs = {"coordinates": {}, "unmappable": ["tba"]}
        merged, _ = r.merge_geocodes(ours, theirs)
        self.assertEqual(sorted(merged["unmappable"]), ["mine", "tba"])


class BannerDateFormat(unittest.TestCase):
    def test_format_banner_date_avoids_platform_strftime_directive(self):
        import generate_banner as gb

        dt = datetime(2026, 7, 5, tzinfo=gb.PST)
        self.assertEqual(gb.format_banner_date(dt), "July 5, 2026")

    def test_svg_includes_formatted_date(self):
        import generate_banner as gb

        dt = datetime(2026, 12, 9, tzinfo=gb.PST)
        out = gb.svg(
            {
                "total": 1,
                "open": 1,
                "opens_soon": 0,
                "closing": 0,
                "in_person": 1,
                "virtual": 0,
                "hybrid": 0,
            },
            today=dt,
        )
        self.assertIn("as of December 9, 2026", out)


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

    def test_escaped_pipe_in_cell_does_not_shift_deadline_column(self):
        # A literal "|" in a cell is escaped as "\|" by sanitize_table_cell.
        # Splitting on it would push the Deadline out of column 6 and misread the
        # badge. The Host cell holds "Foo \| Bar"; the real Deadline (Jul 15, 4
        # days out) must still be read and flip the row to CLOSING SOON.
        row = (
            "| ✅ **[OPEN]** | Foo \\| Bar | Some Hack — Aug 20, 2026 | Online | "
            "Remote | $10k | Jul 15, 2026 | "
            '<a href="https://example.org">Register</a> | Jul 01, 2026 |'
        )
        new_row, changed = cs.update_row(row, self.TODAY)
        self.assertTrue(changed)
        self.assertIn(cs.CLOSING, new_row)
        self.assertNotIn(cs.OPEN, new_row)


class WeeklyDigestWorkflow(unittest.TestCase):
    def test_serializes_and_reuses_open_digest_issue(self):
        path = os.path.join(
            os.path.dirname(__file__), "..", "workflows", "weekly_digest.yml"
        )
        with open(path) as f:
            content = f.read()
        self.assertIn("group: weekly-digest", content)
        self.assertIn("cancel-in-progress: false", content)
        self.assertIn("Open or refresh digest issue", content)
        self.assertIn('gh issue list --repo "$REPO" --label "digest"', content)


class BuildRowOrigin(unittest.TestCase):
    LISTING = {
        "id": "06f72ca6-9ab3-4d22-aa00-bf5c8b362c33",
        "company_name": "Major League Hacking",
        "title": "Some Hackathon",
        "url": "https://example.com/",
    }

    def test_rows_declare_they_came_from_listings_json(self):
        # build_row must stamp the origin that identifies the sync's own rows.
        # This test covers the stamping only. Enforcement that the sync leaves
        # origin='user' rows alone lives in the database, in the
        # hackathons_skip_sync_over_user_rows trigger
        # (supabase/migrations/20260722154046_enforce_conflict_rule.sql).
        self.assertEqual(seed.build_row(self.LISTING)["origin"], "listings_json")

    def test_company_name_is_still_stored_as_host(self):
        self.assertEqual(seed.build_row(self.LISTING)["host"], "Major League Hacking")


if __name__ == "__main__":
    unittest.main()
