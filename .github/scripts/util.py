"""
Utility functions for managing hackathon listings.
"""

import html
import json
import os
import re
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

# Constants
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LISTINGS_FILE = os.path.join(SCRIPT_DIR, "listings.json")
README_FILE = os.path.join(SCRIPT_DIR, "..", "..", "README.md")
PST = ZoneInfo("America/Los_Angeles")

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


def save_listings_to_json(listings):
    """Save listings to the JSON file atomically.

    Serialize to a temp file in the same directory as listings.json, flush and
    fsync it, then os.replace() it over the target. The replace is atomic on
    POSIX, so a crash mid-write can never leave a half-written listings.json;
    readers always see either the old file or the fully written new one. The
    temp file is cleaned up if anything goes wrong.
    """
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


def check_schema(listings):
    """Validate that all listings have required fields.

    Collect every problem across all listings and report them together in a
    single raised ValueError, rather than failing on the first bad entry. That
    way one malformed listing doesn't mask the others or block regeneration of
    the README/banner/gallery for the good ones. Returns True when all listings
    are valid.
    """
    errors = []
    for listing in listings:
        listing_id = listing.get("id", "unknown")
        missing = [field for field in REQUIRED_FIELDS if field not in listing]
        if missing:
            errors.append(
                f"Listing {listing_id} missing field(s): {', '.join(missing)}"
            )
        deadline = listing.get("deadline")
        if deadline is not None:
            try:
                parse_deadline_date(deadline)
            except ValueError as e:
                errors.append(f"Listing {listing_id} has invalid deadline: {e}")
        featured = listing.get("featured")
        if featured is not None and not isinstance(featured, bool):
            errors.append(
                f"Listing {listing_id} has invalid 'featured' "
                f"(expected boolean, got {type(featured).__name__})"
            )
    if errors:
        raise ValueError(
            f"Found {len(errors)} invalid listing(s):\n" + "\n".join(errors)
        )
    return True


def is_featured(listing):
    """Return True if a listing is maintainer-featured."""
    return bool(listing.get("featured", False))


def sort_listings(listings):
    """Sort listings: featured first, then active, newest, then host name."""
    return sorted(
        listings,
        key=lambda x: (
            not is_featured(x),           # Featured pinned to top
            not x.get("active", False),   # Active first
            -x.get("date_posted", 0),     # Newest first
            x.get("company_name", "").lower()
        )
    )


def sanitize_table_cell(value):
    """Escape pipe characters and newlines in a markdown table cell value."""
    if not isinstance(value, str):
        value = str(value)
    value = value.replace("|", "\\|")
    value = value.replace("\n", " ")
    return value.strip()


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
    """Return one of 'open', 'opens_soon', 'closed' for a listing."""
    state = listing.get("state")
    if state in ("open", "opens_soon", "closed"):
        return state
    return "open" if listing.get("active", True) else "closed"


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


def parse_deadline(data, *keys):
    """Return an ISO deadline from the first present key, or None (fail on bad format)."""
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
        fail("Invalid deadline format. Please use YYYY-MM-DD or MM/DD/YYYY.")


def clean_url(url):
    """Clean and normalize a URL."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    # Remove common tracking parameters
    tracking_params = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}
    cleaned_query = urlencode(cleaned_params, doseq=True)
    cleaned_url = urlunparse(parsed._replace(query=cleaned_query))
    return cleaned_url
