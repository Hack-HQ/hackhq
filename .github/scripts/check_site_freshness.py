#!/usr/bin/env python3
"""Fail when a hackathon is in the repo but not on the live site.

The gap this closes
-------------------
Listing data is frozen into the deployment at build time. `prepare-repo-data.mjs`
copies `listings.json` into `web/lib/generated/` during the build and the loaders
`import` it, so the site serves whatever was on `main` when it was last built.
Hourly ISR re-runs those loaders over that *deployed* snapshot, which refreshes
deadline-derived state but cannot introduce a listing the bundle has never seen.

So a hackathon added after the last deploy is invisible, and nothing says so:
`listings.json` is correct, the README table is correct, Supabase is correct, and
CI is green. The only observable symptom is a visitor not finding a hackathon
that a maintainer can see in the repo - which is exactly how it was reported.

This script is the alarm. It is deliberately end-to-end: it fetches the real
public site rather than inspecting a build, so it catches every cause of the same
symptom, not just the one we happen to have in mind - no deploy ran, a deploy
ran but failed, a deploy succeeded from a stale checkout, or the Worker rolled
back to an older version.

Why it runs on a schedule
-------------------------
Every automated edit to listings.json is pushed to main with the default
GITHUB_TOKEN, and GitHub starts no workflow run for such a push (the same
loop-prevention documented in sync_supabase.yml and pinned by test_workflows.py).
A push-triggered check would therefore never see the commits that cause this.

Matching
--------
A listing is "present" when its URL appears in the served HTML, falling back to
the first 40 characters of its title. Listing URLs are distinctive (a Devpost or
Luma slug), and the whole listing set is embedded in the page's RSC payload, so
this is a reliable signal: verified 92/92 against production on 2026-08-27 with
zero false positives.

Exit codes
----------
0  every listing in listings.json is on the site
1  at least one is missing, or the site could not be read

Usage:
    python .github/scripts/check_site_freshness.py
    SITE_URL=https://staging.example.com python .github/scripts/check_site_freshness.py
"""

import json
import os
import sys

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LISTINGS_FILE = os.path.join(SCRIPT_DIR, "listings.json")

SITE_URL = os.environ.get("SITE_URL", "https://hacking-hq.com").rstrip("/")
TIMEOUT = int(os.environ.get("SITE_TIMEOUT", "30"))

# A real browser UA and an HTML Accept header on purpose. Clerk's middleware
# treats a request without them as a non-document request and answers the
# handshake differently, which would make this script reason about a page no
# visitor ever receives.
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0 Safari/537.36 hackhq-freshness-check"
    ),
}


def load_listings():
    with open(LISTINGS_FILE, encoding="utf-8") as f:
        return json.load(f)


def fetch_site():
    """The home page HTML, or (None, reason) when it cannot be read.

    The home page carries the full listing set in its RSC payload - every other
    data-backed route is a filtered view of the same load - so one request is
    enough and keeps this check cheap enough to run hourly.
    """
    try:
        r = requests.get(SITE_URL + "/", headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, f"request to {SITE_URL} failed: {e}"
    if r.status_code != 200:
        return None, f"{SITE_URL} returned HTTP {r.status_code}, expected 200"
    return r.text, None


def missing_listings(listings, html):
    missing = []
    for item in listings:
        url = (item.get("url") or "").strip()
        title = (item.get("title") or item.get("name") or "").strip()
        if url and url in html:
            continue
        if title and title[:40] in html:
            continue
        missing.append(item)
    return missing


def emit_output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        # Heredoc form so a multi-line summary cannot break the file.
        f.write(f"{name}<<__EOF__\n{value}\n__EOF__\n")


def main():
    listings = load_listings()
    html, error = fetch_site()

    if error:
        print(f"::error::Site freshness check could not read the site - {error}")
        emit_output("stale", "true")
        emit_output("summary", error)
        return 1

    missing = missing_listings(listings, html)
    total = len(listings)

    if not missing:
        print(f"All {total} listings in listings.json are live on {SITE_URL}.")
        emit_output("stale", "false")
        emit_output("summary", "")
        return 0

    lines = [
        f"{len(missing)} of {total} listings are in the repository but NOT on {SITE_URL}:",
        "",
    ]
    for item in missing:
        lines.append(
            f"  - {item.get('title') or item.get('name')}"
            f"  [{item.get('company_name', '?')}]  {item.get('url', '')}"
        )
    lines += [
        "",
        "The site serves listing data frozen in at build time, so this means the",
        "deployment is older than listings.json. Fix by deploying:",
        "",
        "  - Automated: set CLOUDFLARE_API_TOKEN in Settings > Secrets and",
        "    variables > Actions. .github/workflows/deploy.yml then ships every",
        "    change to main, including the bot-written listing commits.",
        "  - By hand:   cd web && npm run deploy",
        "",
        "See web/README.md -> Deployment.",
    ]
    summary = "\n".join(lines)
    print(summary)
    print(f"::error::{len(missing)} listing(s) are in the repo but missing from {SITE_URL}")
    emit_output("stale", "true")
    emit_output("summary", summary)
    return 1


if __name__ == "__main__":
    sys.exit(main())
