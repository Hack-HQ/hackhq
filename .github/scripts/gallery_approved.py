#!/usr/bin/env python3
"""
Process an approved "Share a Hackathon Photo" issue.

On `approved` + `gallery` labels:
  1. Parse the issue form fields (hackathon, caption, credit, …).
  2. Find the first attached image URL in the photo field (or whole body).
  3. Download it via auto_extract.safe_get (SSRF-guarded), validate type/size.
  4. Write assets/gallery/<slug>.jpg|.png and append .github/scripts/gallery.json.

The README collage is rebuilt by the caller (generate_gallery.py) in the same
job — a GITHUB_TOKEN push would not trigger gallery.yml.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import util
from auto_extract import safe_get

# Cap matches the website CTA copy. GitHub itself allows larger attachments;
# we refuse anything over this before it lands in the repo.
MAX_BYTES = 5 * 1024 * 1024

# Hosts GitHub uses for issue image attachments / their CDN redirects.
ALLOWED_IMAGE_HOST_SUFFIXES = (
    "github.com",
    "githubusercontent.com",
)

IMAGE_URL_RE = re.compile(
    r"https://(?:github\.com/user-attachments/assets/[A-Za-z0-9\-]+"
    r"|user-images\.githubusercontent\.com/[^\s\)\"'<>]+"
    r"|private-user-images\.githubusercontent\.com/[^\s\)\"'<>]+)",
    re.IGNORECASE,
)

JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

GALLERY_JSON = Path(".github/scripts/gallery.json")
GALLERY_DIR = Path("assets/gallery")


def get_first(data, *keys):
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug or "photo")[:max_len].strip("-") or "photo"


def extract_image_url(text: str) -> str:
    """Return the first GitHub attachment / user-image URL in text."""
    if not text:
        return ""
    match = IMAGE_URL_RE.search(text)
    return match.group(0) if match else ""


def host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in ALLOWED_IMAGE_HOST_SUFFIXES)


def detect_image_type(data: bytes) -> str:
    if data.startswith(JPEG_MAGIC):
        return "jpg"
    if data.startswith(PNG_MAGIC):
        return "png"
    return ""


def load_gallery() -> list:
    if not GALLERY_JSON.exists():
        return []
    raw = json.loads(GALLERY_JSON.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        util.fail("gallery.json is not a JSON array")
    return raw


def save_gallery(entries: list) -> None:
    GALLERY_JSON.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def unique_filename(base: str, ext: str) -> str:
    candidate = f"{base}.{ext}"
    if not (GALLERY_DIR / candidate).exists():
        return candidate
    for i in range(2, 50):
        candidate = f"{base}-{i}.{ext}"
        if not (GALLERY_DIR / candidate).exists():
            return candidate
    util.fail(f"Could not find a free filename for {base}.{ext}")


def download_image(url: str) -> tuple[bytes, str]:
    if not host_allowed(url):
        util.fail(f"Image host not allowed: {urlparse(url).hostname}")

    headers = {
        "User-Agent": "HackHQ-gallery-bot/1.0",
        "Accept": "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
    }
    # Private user-attachment redirects often need the Actions token.
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        response = safe_get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — surface any fetch failure to the issue
        util.fail(f"Could not download the attached image: {exc}")

    data = response.content or b""
    if len(data) == 0:
        util.fail("Downloaded image was empty")
    if len(data) > MAX_BYTES:
        util.fail(f"Image exceeds {MAX_BYTES // (1024 * 1024)} MB limit")

    ext = detect_image_type(data)
    if not ext:
        util.fail("Only JPG and PNG images are accepted")
    return data, ext


def main() -> None:
    if len(sys.argv) < 2:
        util.fail("Missing event data file path")

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue", {})
    body = issue.get("body") or ""
    labels = [l.get("name", "") for l in issue.get("labels", [])]
    user = issue.get("user", {})
    username = user.get("login", "unknown")

    if "gallery" not in labels:
        util.fail(f"Not a gallery issue. Labels: {labels}")

    data = util.parse_issue_body(body)
    hackathon = util.sanitize_field(
        get_first(data, "which_hackathon?", "which_hackathon", "hackathon")
    )
    if not hackathon:
        util.fail("Missing required field: Which hackathon?")

    caption = util.sanitize_field(get_first(data, "caption_(optional)", "caption"))
    credit = util.sanitize_field(
        get_first(data, "credit_name_(optional)", "credit_name", "credit")
    ) or username
    credit_url_raw = get_first(
        data, "link_to_credit_(optional)", "link_to_credit", "credit_url"
    )
    credit_url = util.clean_url(credit_url_raw) if credit_url_raw else ""

    # Prefer the dedicated photo field; fall back to scanning the whole body
    # (GitHub sometimes places the attachment outside the form section).
    photo_field = get_first(data, "your_photo", "photo")
    image_url = extract_image_url(photo_field) or extract_image_url(body)
    if not image_url:
        util.fail(
            "No image attachment found. Drag a JPG or PNG into the "
            '"Your photo" field and re-approve.'
        )

    image_bytes, ext = download_image(image_url)

    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    base = f"{slugify(hackathon)}-{slugify(credit, 24)}"
    filename = unique_filename(base, ext)
    rel_path = f"assets/gallery/{filename}"
    (GALLERY_DIR / filename).write_bytes(image_bytes)

    entries = load_gallery()
    for entry in entries:
        if entry.get("image") == rel_path:
            util.fail(f"Gallery already has {rel_path}")

    new_entry = {
        "image": rel_path,
        "hackathon": hackathon,
    }
    if caption:
        new_entry["caption"] = caption
    if credit:
        new_entry["credit"] = credit
    if credit_url:
        new_entry["credit_url"] = credit_url

    entries.append(new_entry)
    save_gallery(entries)

    util.set_output("commit_message", f"Add gallery photo: {hackathon}")
    # A fourth sink for the submitter's name, and it obeys the same choice: a
    # Co-authored-by trailer would name them in the commit history, which is
    # precisely what "no attribution" asks us not to do. `credit` is empty only
    # on that branch (a blank typed name falls back to the login), so it is the
    # right thing to gate on.
    util.set_output(
        "coauthor_trailer", util.coauthor_trailer(user) if credit else ""
    )
    util.set_output("image_path", rel_path)

    print(f"Successfully added gallery photo: {rel_path}")


if __name__ == "__main__":
    main()
