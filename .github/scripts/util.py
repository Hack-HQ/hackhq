"""
Utility functions for managing hackathon listings.
"""

import html
import json
import os
import re
import tempfile
from datetime import date, datetime
from zoneinfo import ZoneInfo

# Constants
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LISTINGS_FILE = os.path.join(SCRIPT_DIR, "listings.json")
README_FILE = os.path.join(SCRIPT_DIR, "..", "..", "README.md")
PST = ZoneInfo("America/Los_Angeles")

# How many days out still counts as 🔥 CLOSING SOON. Keep this in sync with
# CLOSING_SOON_DAYS in web/lib/listings.ts — the site derives the same badge for
# the globe and the deck, and if the two windows disagree the same listing shows
# a different status on the site than in the README.
CLOSING_SOON_DAYS = 14

# Required fields for each listing
REQUIRED_FIELDS = [
    "id",
    "company_name",   # Host / organizer
    "title",          # Hackathon name
    "url",
    "locations",
    "format",         # In-Person, Virtual, or Hybrid
    "prize",
    "active",
    "is_visible",
    "date_posted",
    "date_updated",
    "source"
]

# Valid formats
VALID_FORMATS = ["In-Person", "Virtual", "Hybrid"]


def get_listings_from_json():
    """Load listings from the JSON file.

    Returns [] when the file is absent. Raises a clear ValueError (naming the
    file and the failing line/column/byte offset) when the file exists but is
    corrupt, instead of letting a raw JSONDecodeError traceback escape.
    """
    if not os.path.exists(LISTINGS_FILE):
        return []
    with open(LISTINGS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"{LISTINGS_FILE} is not valid JSON: {e.msg} "
                f"(line {e.lineno}, column {e.colno}, byte offset {e.pos})"
            ) from e


def listings_file_order(listings):
    """Return ``listings`` in the canonical on-disk order.

    Sorted by host, then title, then id. This is purely a storage concern —
    every renderer calls sort_listings() for display — but the order matters a
    lot for merges.

    Appending each new listing to the end of the array meant every listing PR
    edited the same final lines, so any two of them conflicted by construction:
    17 such PRs took 23 merge rounds because each merge invalidated the rest.
    Keeping the file sorted scatters new entries across it by host name, so two
    PRs adding different hackathons almost never touch the same hunk.

    The id tiebreaker keeps the order total and stable, so a save that changes
    nothing rewrites nothing.
    """
    return sorted(
        listings,
        key=lambda l: (
            str(l.get("company_name", "")).lower(),
            str(l.get("title", "")).lower(),
            str(l.get("id", "")),
        ),
    )


def save_listings_to_json(listings):
    """Save listings to the JSON file atomically, in canonical order.

    Serialize to a temp file in the same directory as listings.json, flush and
    fsync it, then os.replace() it over the target. The replace is atomic on
    POSIX, so a crash mid-write can never leave a half-written listings.json;
    readers always see either the old file or the fully written new one. The
    temp file is cleaned up if anything goes wrong.
    """
    listings = listings_file_order(listings)
    directory = os.path.dirname(LISTINGS_FILE) or "."
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        dir=directory,
        prefix=".listings-",
        suffix=".json.tmp",
        delete=False,
    )
    try:
        json.dump(listings, tmp, indent=2)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, LISTINGS_FILE)
    except BaseException:
        tmp.close()
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)
        raise


def _listing_errors(listing):
    """Return a list of schema-error messages for one listing (empty if valid)."""
    errors = []
    listing_id = listing.get("id", "unknown")
    missing = [field for field in REQUIRED_FIELDS if field not in listing]
    if missing:
        errors.append(f"Listing {listing_id} missing field(s): {', '.join(missing)}")
    for field in ("deadline", "startDate", "endDate"):
        value = listing.get(field)
        if value is not None:
            try:
                parse_deadline_date(value)
            except ValueError as e:
                errors.append(f"Listing {listing_id} has invalid {field}: {e}")
    featured = listing.get("featured")
    if featured is not None and not isinstance(featured, bool):
        errors.append(
            f"Listing {listing_id} has invalid 'featured' "
            f"(expected boolean, got {type(featured).__name__})"
        )
    return errors


def partition_valid_listings(listings):
    """Split ``listings`` into ``(valid, errors)`` without raising.

    ``valid`` is the listings that pass schema validation; ``errors`` is a flat
    list of human-readable messages for every problem found across all listings.
    This lets a consumer regenerate output from the good listings while surfacing
    the bad ones, so one malformed entry can't block the whole build.
    """
    valid = []
    errors = []
    for listing in listings:
        listing_errors = _listing_errors(listing)
        if listing_errors:
            errors.extend(listing_errors)
        else:
            valid.append(listing)
    return valid, errors


def check_schema(listings):
    """Validate that all listings have required fields.

    Collects every problem across all listings and reports them together in a
    single raised ValueError, rather than failing on the first bad entry. Returns
    True when all listings are valid. For non-fatal regeneration that skips only
    the malformed rows, use :func:`partition_valid_listings` instead.
    """
    _, errors = partition_valid_listings(listings)
    if errors:
        raise ValueError(
            f"Found {len(errors)} invalid listing(s):\n" + "\n".join(errors)
        )
    return True


def is_featured(listing):
    """Return True if a listing is maintainer-featured."""
    return bool(listing.get("featured", False))


def sort_listings(listings, today=None):
    """Sort listings: closing soon first, then featured, active, newest, host.

    Closing-soon outranks even a featured pin, and sorts by soonest act-by date
    within its own block: the whole point of the badge is that those rows are
    about to become unjoinable, so burying one under a pin would defeat it. A
    featured listing that is closing soon is already in that top block.

    Sorting on the same rule that renders the badge is deliberate — computing
    the order and the badge from two different places is how the README ended up
    showing closing-soon rows scattered through the middle of the table.
    """
    if today is None:
        today = today_pst()

    def key(listing):
        closing = is_closing_soon(listing, today)
        # date.max parks every other row behind the closing-soon block while
        # keeping this slot a single comparable type for all listings.
        due = urgency_date(listing, today) if closing else None
        return (
            not closing,                        # Closing soon pinned to top
            due or date.max,                    # ...soonest act-by date first
            not is_featured(listing),           # Featured next
            not listing.get("active", False),   # Active first
            -listing.get("date_posted", 0),     # Newest first
            listing.get("company_name", "").lower(),
        )

    return sorted(listings, key=key)


def sanitize_table_cell(value):
    """Escape pipe characters and newlines in a markdown table cell value."""
    if not isinstance(value, str):
        value = str(value)
    value = value.replace("|", "\\|")
    value = value.replace("\n", " ")
    return value.strip()


def split_table_cells(line):
    """Split a markdown table row on unescaped pipe delimiters."""
    text = line.strip().strip("|")
    return [
        c.strip().replace("\\|", "|")
        for c in re.split(r"(?<!\\)\|", text)
    ]


def format_locations(locations):
    """Format location list for display."""
    if not locations:
        return "N/A"
    if len(locations) == 1:
        return sanitize_table_cell(locations[0])
    if len(locations) <= 3:
        return ", ".join(sanitize_table_cell(loc) for loc in locations)
    # For many locations, use expandable details
    joined = ", ".join(sanitize_table_cell(loc) for loc in locations)
    return f"<details><summary>{len(locations)} locations</summary>{joined}</details>"


def escape_attr(value):
    """Escape a value for safe interpolation into an HTML attribute.

    Escapes &, <, >, " and ' so a value containing a quote cannot break out of
    an href/src/alt attribute in the generated README markup.
    """
    return html.escape(str(value), quote=True)


_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")


def sanitize_field(value, max_len=200):
    """Normalize an untrusted free-text field (host / title).

    Removes control characters, collapses whitespace, and truncates. These
    values flow into commit messages, listings.json, and generated markup, so
    stripping control/newline characters stops them smuggling extra lines or
    breaking formatting even when the shell interpolation is already quoted.
    """
    text = _CONTROL_CHARS.sub(" ", str(value or ""))
    text = _WHITESPACE.sub(" ", text).strip()
    if len(text) > max_len:
        text = text[:max_len].rstrip()
    return text


_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def is_valid_email(email):
    """Return True for a syntactically valid, single-line email address."""
    if not isinstance(email, str):
        return False
    email = email.strip()
    return len(email) <= 254 and bool(_EMAIL_RE.match(email))


def format_link(url):
    """Format the registration link as a blue button."""
    button_url = "https://img.shields.io/badge/Register-blue?style=for-the-badge"
    return f'<a href="{escape_attr(url)}"><img src="{button_url}" alt="Register"></a>'


def format_website_link(url):
    """Format a plain website link as a gray button (for upcoming events)."""
    button_url = "https://img.shields.io/badge/Website-gray?style=for-the-badge"
    return f'<a href="{escape_attr(url)}"><img src="{button_url}" alt="Website"></a>'


def resolve_state(listing):
    """Return the stored state: one of 'open', 'opens_soon', 'closed'.

    This is the *base* state as recorded in listings.json. 'closing_soon' is
    never stored, because it is a function of today's date and would go stale
    the moment it was written; use :func:`display_state` to render a listing.
    """
    if listing.get("active") is False:
        return "closed"
    state = listing.get("state")
    if state in ("open", "opens_soon", "closed"):
        return state
    return "open"


def today_pst():
    """Today's date in the project's reference timezone."""
    return datetime.now(tz=PST).date()


def urgency_date(listing, today):
    """The date by which someone has to act on a listing, or None.

    An application deadline is authoritative when one exists — it is the date
    you must register by, and it is the only thing a "closing soon" badge can
    honestly mean. With no deadline recorded, the event itself is the thing to
    act on: the start date while it is still upcoming, and the end date once it
    is already running (a hackathon you can still join for three more days is
    exactly what a closing-soon badge is for).

    Only the structured `deadline` / `startDate` / `endDate` fields are read.
    Dates written into the Hackathon *title* are never parsed — harvesting those
    is what made cuHacking look like it was closing when it was not (issue #70).
    """
    deadline = listing.get("deadline")
    if deadline:
        return parse_deadline_date(deadline)
    for field in ("startDate", "endDate"):
        value = listing.get(field)
        if value:
            parsed = parse_deadline_date(value)
            if parsed >= today:
                return parsed
    return None


def is_closing_soon(listing, today):
    """True when an open listing is within CLOSING_SOON_DAYS of its act-by date.

    Only listings that are actually open can be closing soon: an 'opens_soon'
    listing has nothing to close yet, and a closed one has already closed.
    """
    if resolve_state(listing) != "open":
        return False
    target = urgency_date(listing, today)
    if target is None:
        return False
    return 0 <= (target - today).days <= CLOSING_SOON_DAYS


def is_expired(listing, today):
    """True when a non-closed listing's window has verifiably passed.

    Decided only from the structured date fields, in order of authority:

    - A ``deadline`` strictly before today means registration has closed. The
      deadline day itself is still open, matching the 0-days-left convention
      in :func:`is_closing_soon`. When a deadline exists it is the whole
      answer — event dates are never consulted, because the deadline is the
      date you must act on even when it falls after the event starts.
    - Otherwise an ``endDate`` before today means the event itself is over.
    - Otherwise a ``startDate`` before today, with no end date recorded,
      means a single-dated event has begun and passed.

    A listing with no structured dates never auto-expires: dates written into
    the Hackathon *title* are never parsed (issue #70's hard rule), so a
    listing we have no dated evidence about stays as-is rather than being
    closed on a guess. 'opens_soon' listings are held to the same rule — one
    whose event dates have already passed is expired, but one with only a
    future date (or no dates) is untouched.
    """
    if resolve_state(listing) == "closed":
        return False
    deadline = listing.get("deadline")
    if deadline:
        return parse_deadline_date(deadline) < today
    end = listing.get("endDate")
    if end:
        return parse_deadline_date(end) < today
    start = listing.get("startDate")
    if start:
        return parse_deadline_date(start) < today
    return False


def close_expired(listings, today):
    """Close every listing whose window has verifiably passed (mutates in place).

    Unlike 'closing_soon', which is derived fresh at render time, closing is a
    *fact* and gets written back: state='closed', active=False (both, because
    renderers consult both fields), plus date_closed and an archive_note that
    record when and why the automation closed it — so a human auditing the
    archive can tell an auto-closure from a maintainer one. date_updated is
    bumped so downstream consumers notice the change.

    Returns a list of ``(title, reason)`` pairs for logging/commit messages.
    Idempotent: already-closed listings are skipped by :func:`is_expired`, so
    a second run on the same day closes nothing.
    """
    closed = []
    iso = today.isoformat()
    for listing in listings:
        if not is_expired(listing, today):
            continue
        deadline = listing.get("deadline")
        if deadline:
            reason = f"deadline passed {parse_deadline_date(deadline).isoformat()}"
        else:
            ended = listing.get("endDate") or listing.get("startDate")
            reason = f"event ended {parse_deadline_date(ended).isoformat()}"
        listing["state"] = "closed"
        listing["active"] = False
        listing["date_closed"] = iso
        listing["archive_note"] = f"Auto-archived {iso} — {reason}"
        listing["date_updated"] = get_current_timestamp()
        # Featuring is a homepage promise, and a closed listing must never keep
        # it (#150): the deck pins featured entries to the top, and before this
        # the only guard was test_featured going red *after* the fact. Clearing
        # the flag here makes the removal part of the closure itself.
        if listing.get("featured"):
            listing["featured"] = False
        closed.append((listing.get("title", ""), reason))
    return closed


def display_state(listing, today=None):
    """Return the state to render: 'open', 'closing_soon', 'opens_soon', 'closed'.

    Derived fresh from today's date on every render, which is what keeps the
    badge from going stale between runs.
    """
    if today is None:
        today = today_pst()
    state = resolve_state(listing)
    if state == "open" and is_closing_soon(listing, today):
        return "closing_soon"
    return state


def format_date(timestamp):
    """Format Unix timestamp as readable date."""
    dt = datetime.fromtimestamp(timestamp, tz=PST)
    return dt.strftime("%b %d, %Y")


def parse_deadline_date(value):
    """Parse deadline date from YYYY-MM-DD or MM/DD/YYYY."""
    if not isinstance(value, str):
        raise ValueError(f"Invalid deadline type: expected string, got {type(value).__name__}")
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid deadline '{value}' (expected YYYY-MM-DD or MM/DD/YYYY)")


def format_deadline(value):
    """Format optional deadline for markdown tables."""
    if not value:
        return "—"
    return parse_deadline_date(value).strftime("%b %d, %Y")


def embed_table(filepath, table, start_marker, end_marker):
    """Embed the generated table between markers in a file."""
    with open(filepath, "r") as f:
        content = f.read()

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)

    if start_idx == -1 or end_idx == -1:
        raise ValueError(f"Could not find markers in {filepath}")

    new_content = (
        content[:start_idx + len(start_marker)]
        + "\n"
        + table
        + "\n"
        + content[end_idx:]
    )

    with open(filepath, "w") as f:
        f.write(new_content)


def set_output(name, value):
    """Set a GitHub Actions output variable."""
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            # Handle multiline values
            if "\n" in str(value):
                import uuid
                delimiter = uuid.uuid4().hex
                f.write(f"{name}<<{delimiter}\n{value}\n{delimiter}\n")
            else:
                f.write(f"{name}={value}\n")
    else:
        print(f"::set-output name={name}::{value}")


def fail(message):
    """Set error output and exit."""
    set_output("error_message", message)
    print(f"Error: {message}")
    exit(1)


def warn(message):
    """Emit a GitHub Actions warning annotation (visible in the run/PR UI).

    Use for non-fatal problems (e.g. a banner that couldn't be regenerated) so
    they surface loudly instead of being buried in a plain print.
    """
    print(f"::warning::{message}")


def get_current_timestamp():
    """Get current Unix timestamp."""
    return int(datetime.now(tz=PST).timestamp())


def generate_uuid():
    """Generate a new UUID for a listing."""
    import uuid
    return str(uuid.uuid4())


DEFAULT_REPO = "Jose-Gael-Cruz-Lopez/hackhq"


def repo_slug():
    """owner/repo — from GITHUB_REPOSITORY (set by Actions) or the default."""
    return os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPO


def repo_url():
    """Base GitHub URL for this repository."""
    return f"https://github.com/{repo_slug()}"


def parse_issue_body(body, strip_symbols=False):
    """Parse a GitHub issue body's '### Field' sections into a {field: value} dict.

    Field names are lowercased with spaces -> underscores. Set strip_symbols=True
    to also drop ? ( ) from keys (used where field lookups omit those chars).
    Shared by contribution_approved.py and auto_extract.py.
    """
    data = {}
    current_field = None
    current_value = []
    for line in body.strip().split("\n"):
        if line.startswith("### "):
            if current_field and current_value:
                data[current_field] = "\n".join(current_value).strip()
            name = line[4:].strip().lower().replace(" ", "_")
            if strip_symbols:
                name = name.replace("?", "").replace("(", "").replace(")", "")
            current_field = name
            current_value = []
        elif current_field:
            if line.strip() and line.strip() != "_No response_":
                current_value.append(line)
    if current_field and current_value:
        data[current_field] = "\n".join(current_value).strip()
    return data


def parse_state(data):
    """Map issue status fields to a listing state (open / opens_soon)."""
    status = str(data.get("status") or "").strip().lower()
    if "soon" in status:
        return "opens_soon"
    if "open" in status:
        return "open"
    # Backward compatibility with the older registration-open field.
    active = str(
        data.get("is_this_hackathon_currently_open_for_registration?")
        or data.get("is_this_hackathon_currently_open_for_registration")
        or ""
    ).strip().lower()
    if active == "no":
        return "opens_soon"
    return "open"


def parse_date_field(data, field_name, *keys):
    """Return an ISO date from the first present key, or None (fail on bad format)."""
    raw = ""
    for key in keys:
        value = data.get(key)
        if value and str(value).strip():
            raw = str(value).strip()
            break
    if not raw:
        return None
    try:
        return parse_deadline_date(raw).isoformat()
    except ValueError:
        fail(f"Invalid {field_name} format. Please use YYYY-MM-DD or MM/DD/YYYY.")


def parse_deadline(data, *keys):
    """Return an ISO deadline from the first present key, or None (fail on bad format)."""
    return parse_date_field(data, "deadline", *keys)


def clean_url(url):
    """Clean and normalize a URL.

    Returns "" for empty or host-less input. clean_url must never manufacture a
    URL out of nothing: an empty or whitespace-only value used to become
    "https://" (and "http://"/"https://" alone stayed host-less), which then
    slipped past callers' emptiness checks and produced a broken Register link.
    Callers should treat "" as a missing URL.
    """
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    # Remove common tracking parameters
    tracking_params = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    parsed = urlparse(url)
    if not parsed.netloc:
        return ""
    params = parse_qs(parsed.query)
    cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}
    cleaned_query = urlencode(cleaned_params, doseq=True)
    cleaned_url = urlunparse(parsed._replace(query=cleaned_query))
    return cleaned_url
