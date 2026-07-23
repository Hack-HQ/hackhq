#!/usr/bin/env python3
"""
Auto-extract hackathon details from a URL using AI.

This script:
1. Fetches the webpage content
2. Uses OpenAI API to extract structured data
3. Adds the hackathon to listings.json
"""

import ipaddress
import json
import os
import socket
import sys
import re
import time
from urllib.parse import urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup
import util

# Try to import OpenAI
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


MAX_REDIRECTS = 5


def _resolve_and_validate(host):
    """Resolve a hostname once and ensure every A/AAAA record is public.

    Returns ``(ok, reason, ip_set, pinned_ip)``. ``ip_set`` is a frozenset of the
    resolved address strings and ``pinned_ip`` is one validated address the caller
    can connect to directly. Blocks SSRF to the cloud metadata endpoint
    (169.254.169.254), localhost, and RFC1918 / link-local / reserved ranges.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, f"Could not resolve host: {host}", frozenset(), None
    ips = []
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False, f"Unresolvable address for host: {host}", frozenset(), None
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False, f"Refusing to fetch internal address {ip} (host {host})", frozenset(), None
        ips.append(ip_str)
    if not ips:
        return False, f"Could not resolve host: {host}", frozenset(), None
    return True, None, frozenset(ips), ips[0]


def _resolved_ips_are_public(host):
    """Resolve a hostname and ensure no address is private/loopback/internal.

    Returns (ok, reason). Thin wrapper over :func:`_resolve_and_validate`.
    """
    ok, reason, _, _ = _resolve_and_validate(host)
    return ok, reason


def _validate_fetch_url(url):
    """Allow only http(s) URLs pointing at public hosts."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, f"Only http(s) URLs may be fetched (got '{parsed.scheme}')"
    if not parsed.hostname:
        return False, "URL has no host"
    return _resolved_ips_are_public(parsed.hostname)


def _idna_ascii(host):
    """Return the ASCII (IDNA/punycode) form of ``host``.

    ``requests`` IDNA-encodes a non-ASCII host to punycode when it prepares the
    URL it actually puts on the wire, so the pinned host must be stored and
    compared in that same ASCII form. Otherwise an internationalized (Unicode)
    hostname would never equal ``urlparse(request.url).hostname`` inside the
    adapter, the pin would be skipped, and the transport would re-resolve DNS
    unchecked — the exact DNS-rebinding hole this guard closes. Raises
    ``ValueError`` on an invalid international label (fail closed).
    """
    host = host.lower()
    try:
        host.encode("ascii")
        return host  # already ASCII — requests leaves it unchanged
    except UnicodeEncodeError:
        pass
    try:
        import idna  # requests' own IDNA dependency; matches its uts46 encoding
        return idna.encode(host, uts46=True).decode("ascii")
    except Exception as e:
        raise ValueError(f"URL has an invalid international host label: {host!r}") from e


def _validate_and_pin(url):
    """Validate scheme/host and resolve+validate the host in one place.

    Returns ``(ok, reason, host, ip_set, pinned_ip)`` so the caller can connect
    to the exact IP that was validated (closing the check-then-connect gap). The
    returned ``host`` is normalized to its ASCII (IDNA) form so it matches the
    host ``requests`` will send, and so resolution and pinning use one identity.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, f"Only http(s) URLs may be fetched (got '{parsed.scheme}')", None, frozenset(), None
    host = parsed.hostname
    if not host:
        return False, "URL has no host", None, frozenset(), None
    try:
        host = _idna_ascii(host)
    except ValueError as e:
        return False, str(e), None, frozenset(), None
    ok, reason, ip_set, pinned_ip = _resolve_and_validate(host)
    return ok, reason, host, ip_set, pinned_ip


class _PinnedIPAdapter(requests.adapters.HTTPAdapter):
    """HTTPAdapter that connects to a pre-validated IP for a specific host.

    Closes the SSRF DNS-rebinding (TOCTOU) gap in ``safe_get``: instead of letting
    the transport resolve DNS a second, unchecked time, the socket connects to the
    exact IP that the SSRF guard already validated as public. The original
    hostname is preserved for the ``Host`` header, the TLS SNI (``server_hostname``)
    and certificate hostname verification (``assert_hostname``), so normal HTTPS to
    public hosts keeps working and certificates are still checked against the name.
    """

    def __init__(self, host, pinned_ip, **kwargs):
        self._pinned_host = host
        self._pinned_ip = pinned_ip
        super().__init__(**kwargs)

    def send(self, request, **kwargs):
        parsed = urlparse(request.url)
        if parsed.hostname != self._pinned_host:
            # Fail closed. Forwarding a request whose host is not the one we
            # validated and pinned (e.g. an IDNA-encoding mismatch) would let the
            # transport resolve DNS a second, unchecked time — the TOCTOU hole.
            raise ValueError(
                f"Refusing to fetch: request host {parsed.hostname!r} does not "
                f"match the validated pinned host {self._pinned_host!r}"
            )
        ip = self._pinned_ip
        # Bracket IPv6 literals for the URL netloc.
        netloc_host = f"[{ip}]" if ":" in ip else ip
        netloc = f"{netloc_host}:{parsed.port}" if parsed.port else netloc_host
        request.url = urlunparse(parsed._replace(netloc=netloc))
        # Preserve the real hostname for the Host header (urllib3 would
        # otherwise derive it from the IP in the rewritten URL).
        request.headers["Host"] = self._pinned_host
        if parsed.scheme == "https":
            # SNI + certificate hostname must match the real host, not the IP.
            pool_kw = self.poolmanager.connection_pool_kw
            pool_kw["server_hostname"] = self._pinned_host
            pool_kw["assert_hostname"] = self._pinned_host
        return super().send(request, **kwargs)


def _build_pinned_session(host, pinned_ip):
    """A one-host requests.Session whose connections are pinned to pinned_ip."""
    session = requests.Session()
    adapter = _PinnedIPAdapter(host, pinned_ip)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _get_with_retries(session, url, headers, timeout, retries=2, backoff=1.5):
    """GET a single URL, retrying only transient network errors with backoff."""
    last_exc = None
    for attempt in range(retries + 1):
        try:
            return session.get(
                url, headers=headers, timeout=timeout, allow_redirects=False
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exc = e
            if attempt < retries:
                time.sleep(backoff * (attempt + 1))
    raise last_exc


def safe_get(url, headers, timeout=30):
    """requests.get with SSRF protection and per-hop redirect validation.

    Never falls back to verify=False — TLS errors propagate. Redirects are
    followed manually so every hop's host is re-checked against the SSRF guard.
    Transient network errors are retried with backoff.

    Each hop is resolved and validated, then the connection is *pinned* to the
    validated IP so DNS is not resolved again on the wire (issue #74). As defense
    in depth, the host is re-resolved and the fetch is rejected if its address set
    changed between the check and the connect (a DNS-rebinding resolver).
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        ok, reason, host, ip_set, pinned_ip = _validate_and_pin(current)
        if not ok:
            raise ValueError(reason)
        # Re-resolve and require an identical address set. This defeats a
        # DNS-rebinding attacker that answers the validation with a public IP and
        # the connect with an internal one: any change means we refuse to fetch.
        ok2, reason2, ip_set2, _ = _resolve_and_validate(host)
        if not ok2:
            raise ValueError(reason2)
        if ip_set != ip_set2:
            raise ValueError(
                f"Host {host} resolved to a different address set between "
                f"validation and connect (possible DNS rebinding); refusing to fetch"
            )
        session = _build_pinned_session(host, pinned_ip)
        try:
            response = _get_with_retries(session, current, headers, timeout)
        finally:
            session.close()
        if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location")
            if not location:
                return response
            current = urljoin(current, location)
            continue
        return response
    raise ValueError("Too many redirects while fetching URL")


def fetch_page_content(url):
    """Fetch and parse webpage content."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        # Fail closed on TLS errors (no verify=False fallback) and block SSRF to
        # internal/loopback/link-local hosts, re-checking on every redirect hop.
        response = safe_get(url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Extract metadata before removing elements
        meta_description = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag:
            meta_description = meta_tag.get("content", "")
        og_title = ""
        og_tag = soup.find("meta", attrs={"property": "og:title"})
        if og_tag:
            og_title = og_tag.get("content", "")
        og_desc = ""
        og_desc_tag = soup.find("meta", attrs={"property": "og:description"})
        if og_desc_tag:
            og_desc = og_desc_tag.get("content", "")

        # Extract JSON-LD structured data (many event sites embed this)
        json_ld_text = ""
        for script_tag in soup.find_all("script", type="application/ld+json"):
            try:
                ld_data = json.loads(script_tag.string or "")
                json_ld_text = json.dumps(ld_data, indent=2)[:4000]
            except (json.JSONDecodeError, TypeError):
                pass

        title_tag = soup.find("title")
        page_title = title_tag.get_text() if title_tag else og_title

        # Remove non-content elements
        for el in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
            el.decompose()

        text = soup.get_text(separator="\n", strip=True)

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        text = "\n".join(lines)

        # Prepend metadata for better AI extraction context
        metadata_parts = []
        if meta_description:
            metadata_parts.append(f"Meta Description: {meta_description}")
        if og_title and og_title != page_title:
            metadata_parts.append(f"OG Title: {og_title}")
        if og_desc and og_desc != meta_description:
            metadata_parts.append(f"OG Description: {og_desc}")
        if json_ld_text:
            metadata_parts.append(f"Structured Data:\n{json_ld_text}")

        if metadata_parts:
            metadata_block = "\n".join(metadata_parts) + "\n\n---\n\n"
            text = metadata_block + text

        if len(text) > 12000:
            text = text[:12000] + "\n...[truncated]"

        # If very little text was extracted, the page likely requires JS rendering
        if len(text.strip()) < 200:
            text = (
                f"[Page requires JavaScript to render. Limited content available.]\n"
                f"URL: {url}\n"
                f"Page Title: {page_title}\n"
                f"Meta Description: {meta_description}\n"
                f"OG Title: {og_title}\n"
                f"OG Description: {og_desc}\n"
                f"{text}"
            )

        return {
            "text": text,
            "title": page_title,
            "url": url
        }

    except Exception as e:
        return {
            "text": f"Error fetching page: {str(e)}",
            "title": "",
            "url": url,
            "error": str(e)
        }


def extract_with_openai(page_content, additional_notes=""):
    """Use OpenAI to extract structured data from page content."""
    if not HAS_OPENAI:
        util.fail("OpenAI library not installed. Run: pip install openai")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        util.fail("OPENAI_API_KEY environment variable not set. Add it as a repository secret.")

    client = OpenAI(api_key=api_key)

    prompt = f"""Analyze this hackathon listing/event page and extract the following information.
This is for a repository that tracks HACKATHONS (coding events / build competitions).

Page Title: {page_content['title']}
URL: {page_content['url']}
Additional Notes from submitter: {additional_notes}

Page Content:
{page_content['text']}

---

Extract and return a JSON object with these fields:
- company_name: The host or organizer of the hackathon (e.g., "MIT", "Major League Hacking", "UC Berkeley"). Extract from the URL domain if not found in content.
- title: The hackathon name (e.g., "HackMIT 2026", "PennApps XXVI", "TreeHacks"). Include the year/edition if available.
- locations: Array of locations (e.g., ["Cambridge, MA"], ["Online"]). Use ["Online"] for fully virtual events.
- format: One of "In-Person", "Virtual", or "Hybrid"
- prize: The prize pool or rewards if mentioned (e.g., "$50K in prizes", "Swag + prizes"). Use "—" if not specified.
- startDate: The first day of the hackathon/event itself as YYYY-MM-DD, or null if not stated.
- endDate: The final day of the hackathon/event itself as YYYY-MM-DD, or null if not stated. Use the same date as startDate for one-day events.
- is_hackathon: true if this page is for a hackathon / coding event / build competition, false otherwise

For is_hackathon: set to true if the posting mentions a hackathon, hack day, build competition, coding marathon, datathon, or similar event. Set to false only if it is clearly not a hackathon (e.g., a job posting or general conference).

For startDate/endDate: these are the hackathon event dates, not application or registration deadlines. Do not guess if the event dates are not shown.

If the page content is limited (JavaScript-rendered page), do your best to extract from the URL, page title, meta descriptions, and any available structured data. Make reasonable inferences for the host name from the URL domain.

Return ONLY valid JSON, no other text."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured data from hackathon listings. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=1000,
            timeout=60,
        )

        result_text = response.choices[0].message.content.strip()

        # Clean up markdown code blocks if present
        if result_text.startswith("```"):
            result_text = re.sub(r"^```json?\n?", "", result_text)
            result_text = re.sub(r"\n?```$", "", result_text)

        return json.loads(result_text)

    except json.JSONDecodeError as e:
        util.fail(f"Failed to parse AI response as JSON: {e}\nResponse: {result_text}")
    except Exception as e:
        util.fail(f"OpenAI API error: {str(e)}")


def extract_url_from_body(body):
    """Try multiple methods to extract URL from issue body."""
    # Method 1: Parse structured fields (strip_symbols matches the field keys
    # this script looks up, e.g. deadline_optional).
    data = util.parse_issue_body(body, strip_symbols=True)

    # Try various field names
    url_fields = [
        "link_to_hackathon",
        "link_to_opportunity",
        "link",
        "url",
        "link_to_hackathon_page",
        "application_link"
    ]

    for field in url_fields:
        if field in data and data[field]:
            url = data[field].strip()
            if url.startswith("http"):
                return url, data

    # Method 2: Find any URL in the body
    url_pattern = r'https?://[^\s<>"\')\]]+'
    matches = re.findall(url_pattern, body)
    if matches:
        return matches[0], data

    return None, data


def _parse_extracted_event_date(extracted, *keys):
    """Parse optional AI-extracted event dates; ignore malformed model output."""
    raw = ""
    for key in keys:
        value = extracted.get(key)
        if value and str(value).strip():
            raw = str(value).strip()
            break
    if not raw:
        return None
    try:
        return util.parse_deadline_date(raw).isoformat()
    except ValueError:
        util.warn(f"Ignoring invalid AI-extracted event date: {raw}")
        return None


def main():
    if len(sys.argv) < 2:
        util.fail("Missing event data file path")

    event_path = sys.argv[1]

    print(f"Reading event from: {event_path}")

    with open(event_path, "r") as f:
        event = json.load(f)

    issue = event.get("issue", {})
    body = issue.get("body", "")
    username = issue.get("user", {}).get("login", "unknown")

    print(f"Issue body:\n{body}\n")

    # Extract URL from body
    url, data = extract_url_from_body(body)

    if not url:
        util.fail("No URL found in issue body. Please make sure to include a valid URL.")

    url = util.clean_url(url)
    print(f"Extracted URL: {url}")

    notes = data.get("any_additional_context_optional", "") or data.get("notes", "")
    state = util.parse_state(data)
    deadline = util.parse_deadline(data, "deadline_optional", "deadline")
    submitted_start_date = util.parse_date_field(
        data,
        "start date",
        "start_date_optional",
        "start_date",
        "hackathon_start_date_optional",
        "hackathon_start_date",
    )
    submitted_end_date = util.parse_date_field(
        data,
        "end date",
        "end_date_optional",
        "end_date",
        "hackathon_end_date_optional",
        "hackathon_end_date",
    )

    print(f"Fetching content from: {url}")

    # Fetch page content
    page_content = fetch_page_content(url)

    if "error" in page_content:
        util.fail(f"Failed to fetch page: {page_content['error']}")

    print(f"Page title: {page_content['title']}")
    print(f"Content length: {len(page_content['text'])} chars")
    print("Extracting details with AI...")

    # Extract with AI
    extracted = extract_with_openai(page_content, notes)

    print(f"Extracted: {json.dumps(extracted, indent=2)}")

    # Validate extracted data. Model output is fully untrusted: coalesce nulls
    # (a JSON `null` makes .get() return None, so a bare .strip() would crash),
    # and sanitize the free-text host/title before they reach listings.json or a
    # commit message.
    company_name = util.sanitize_field(extracted.get("company_name"))
    title = util.sanitize_field(extracted.get("title"))
    locations = extracted.get("locations") or []
    fmt = (extracted.get("format") or "").strip()
    start_date = submitted_start_date or _parse_extracted_event_date(
        extracted, "startDate", "start_date"
    )
    end_date = submitted_end_date or _parse_extracted_event_date(
        extracted, "endDate", "end_date"
    )

    if not company_name or company_name == "Unknown":
        util.fail("AI extraction failed: could not determine the host/organizer. Please use the Quick Add template instead.")
    if not title or title == "Unknown":
        util.fail("AI extraction failed: could not determine the hackathon name. Please use the Quick Add template instead.")
    if not isinstance(locations, list) or len(locations) == 0:
        locations = ["Online"]
    if fmt not in util.VALID_FORMATS:
        fmt = "In-Person"

    # Sanitize locations — remove any that look like URLs or HTML
    clean_locations = []
    for loc in locations:
        loc = loc.strip()
        if loc and not loc.startswith("http") and "<" not in loc:
            clean_locations.append(loc)
    if not clean_locations:
        clean_locations = ["Online"]
    locations = clean_locations

    # Warn if not confirmed as a hackathon, but still proceed
    # since a maintainer already approved the issue
    warning_msg = ""
    if not extracted.get("is_hackathon", False):
        warning_msg = "AI did not confirm this is a hackathon. A maintainer approved it, so it was added anyway. Please verify and remove if incorrect."
        print(f"WARNING: {warning_msg}")

    # Check for duplicates (by URL or by host+title)
    listings = util.get_listings_from_json()
    for listing in listings:
        if listing.get("url") == url:
            util.set_output("is_duplicate", "true")
            util.set_output("duplicate_id", listing.get("id", ""))
            util.set_output("duplicate_reason", f"This URL already exists in the repository")
            util.set_output("commit_message", "")
            print(f"DUPLICATE DETECTED: URL already exists (ID: {listing.get('id')})")
            sys.exit(0)
        if (str(listing.get("company_name", "")).lower() == company_name.lower() and
                str(listing.get("title", "")).lower() == title.lower()):
            util.set_output("is_duplicate", "true")
            util.set_output("duplicate_id", listing.get("id", ""))
            util.set_output("duplicate_reason", f"'{company_name} - {title}' already exists in the repository")
            util.set_output("commit_message", "")
            print(f"DUPLICATE DETECTED: {company_name} - {title} already exists (ID: {listing.get('id')})")
            sys.exit(0)

    # Create the listing
    new_listing = {
        "id": util.generate_uuid(),
        "company_name": company_name,
        "title": title,
        "url": url,
        "locations": locations,
        "format": fmt,
        "prize": extracted.get("prize", "—") or "—",
        "state": state,
        "active": state != "closed",
        "is_visible": True,
        "date_posted": util.get_current_timestamp(),
        "date_updated": util.get_current_timestamp(),
        "source": username
    }
    if deadline:
        new_listing["deadline"] = deadline
    if start_date:
        new_listing["startDate"] = start_date
    if end_date:
        new_listing["endDate"] = end_date

    # Save
    listings.append(new_listing)
    util.save_listings_to_json(listings)

    # Set outputs
    company = new_listing["company_name"]
    title = new_listing["title"]
    util.set_output("commit_message", f"Add {company} - {title}")
    util.set_output("contributor_name", username)
    util.set_output("contributor_email", "actions@github.com")
    util.set_output("extracted_data", json.dumps(extracted))
    if warning_msg:
        util.set_output("warning", warning_msg)

    print(f"Successfully added: {company} - {title}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        # util.fail() and the duplicate path exit intentionally — let them.
        raise
    except Exception as e:
        util.fail(f"Unexpected error during extraction: {e}")
