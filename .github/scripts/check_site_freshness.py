#!/usr/bin/env python3
"""Fail when the live site is not serving what the repository says it should.

The gap this closes
-------------------
Listing data is frozen into the deployment at build time. `prepare-repo-data.mjs`
copies `listings.json` into `web/lib/generated/` during the build and the loaders
`import` it, so the site serves whatever was on `main` when it was last built.
Hourly ISR re-runs those loaders over that *deployed* snapshot, which refreshes
deadline-derived state but cannot introduce a listing the bundle has never seen,
nor drop one the repository has since archived.

So a hackathon added (or closed) after the last deploy is wrong on the site, and
nothing says so: `listings.json` is correct, the README table is correct,
Supabase is correct, and CI is green. This script is the alarm.

How it decides
--------------
1. **Exact comparison, preferred.** The build publishes the snapshot it was made
   from at `/site-data/listings.json` and the commit it came from at
   `/site-data/build.json` (see `web/scripts/prepare-repo-data.mjs`). Listing
   ids and contents are compared one by one, so the answer is precise: which
   listings are missing, which are stale (present but different from the repo,
   e.g. closed here and still open there), and how many commits behind `main`
   the live build is.

2. **Textual fallback.** A deployment made before those files existed has no
   `/site-data/`. Then the home page HTML is searched for each listing's URL
   (falling back to the first 40 characters of its title). That is how this
   check originally worked, and it is kept so the alarm never goes dark across
   the transition — but it is only a fallback: the page's RSC payload is split
   into arbitrary <script> chunks, and a URL straddling a boundary reads as a
   missing hackathon (TreeHacks and VTHacks were reported missing from a
   deployment that contained them, 2026-09-01).

3. **Visitor probe.** Independently of the data, the home page is requested
   the way a browser would (HTML Accept header, browser UA) without following
   redirects. A healthy site answers 200. A redirect to `*.clerk.accounts.dev`
   means the deployed build was made with a Clerk *development* publishable key
   (`pk_test_…`): every first visit bounces through a dev-instance handshake,
   sign-in is broken, crawlers see a redirect, and following that chain is what
   used to surface here as an unexplained HTTP 500. That is reported by name
   with the fix, rather than as "site returned 3xx".

Why it runs after deploys and on a schedule
-------------------------------------------
site_freshness.yml chains on the Deploy workflow (workflow_run), so every
deploy is checked as soon as it lands, and keeps an hourly schedule as a
backstop for a Worker rolled back or redeployed from outside CI.

Exit codes
----------
0  the live site matches listings.json and answers visitors normally
1  something is missing, stale, misconfigured, or the site could not be read

Usage:
    python .github/scripts/check_site_freshness.py
    SITE_URL=https://staging.example.com python .github/scripts/check_site_freshness.py
"""

import json
import os
import subprocess
import sys

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.join(SCRIPT_DIR, "..", "..")
LISTINGS_FILE = os.path.join(SCRIPT_DIR, "listings.json")

SITE_URL = os.environ.get("SITE_URL", "https://hacking-hq.com").rstrip("/")
TIMEOUT = int(os.environ.get("SITE_TIMEOUT", "30"))

# A real browser UA and an HTML Accept header on purpose. Clerk's middleware
# treats a request without them as a non-document request and never starts a
# handshake for it, which would hide exactly the misconfiguration the visitor
# probe exists to catch.
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0 Safari/537.36 hackhq-freshness-check"
    ),
}

# The data files are static assets, so they can be fetched as plain JSON. The
# no-cache header asks every cache between here and the Worker for the current
# object rather than one from before the deploy this run is verifying.
DATA_HEADERS = {
    "accept": "application/json",
    "cache-control": "no-cache",
    "user-agent": HEADERS["user-agent"],
}

# Fields that make a listing what it is on the site. date_updated is excluded on
# purpose: it changes on every edit, and an edit that changes nothing visible
# should not be reported as staleness.
COMPARED_FIELDS = (
    "company_name",
    "title",
    "url",
    "locations",
    "format",
    "prize",
    "state",
    "active",
    "is_visible",
    "deadline",
    "startDate",
    "endDate",
    "featured",
)


def load_listings():
    with open(LISTINGS_FILE, encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------------------
# 1. Exact comparison against /site-data/
# --------------------------------------------------------------------------


def fetch_site_data():
    """(build_info, live_listings, error).

    error is None on success. A 404 on either file means the deployment predates
    them; that is reported as error="unavailable" so the caller can fall back.
    """
    try:
        b = requests.get(
            f"{SITE_URL}/site-data/build.json", headers=DATA_HEADERS, timeout=TIMEOUT
        )
        l = requests.get(
            f"{SITE_URL}/site-data/listings.json", headers=DATA_HEADERS, timeout=TIMEOUT
        )
    except requests.RequestException as e:
        return None, None, f"request to {SITE_URL}/site-data/ failed: {e}"
    if b.status_code == 404 or l.status_code == 404:
        return None, None, "unavailable"
    if b.status_code != 200 or l.status_code != 200:
        return (
            None,
            None,
            f"{SITE_URL}/site-data/ returned HTTP {b.status_code} / {l.status_code}, expected 200",
        )
    try:
        build = b.json()
        listings = l.json()
    except ValueError as e:
        return None, None, f"{SITE_URL}/site-data/ is not valid JSON: {e}"
    if not isinstance(listings, list) or not isinstance(build, dict):
        return None, None, f"{SITE_URL}/site-data/ has an unexpected shape"
    return build, listings, None


def _signature(item):
    return json.dumps(
        {k: item.get(k) for k in COMPARED_FIELDS}, sort_keys=True, ensure_ascii=False
    )


def diff_listings(repo, live):
    """Compare the repository's listings with the deployed snapshot.

    Returns a dict with three lists of listings (repo-side objects where they
    exist):
      missing - in the repository, not on the site at all
      stale   - on the site, but with different visible fields than the
                repository (a closed listing still open, a moved deadline, a
                fixed link)
      extra   - on the site, no longer in the repository (never expected: the
                repo is append-only, but a rollback would produce it)
    """
    live_by_id = {item.get("id"): item for item in live if item.get("id")}
    repo_by_id = {item.get("id"): item for item in repo if item.get("id")}
    missing = [item for item in repo if item.get("id") not in live_by_id]
    stale = [
        item
        for item in repo
        if item.get("id") in live_by_id
        and _signature(item) != _signature(live_by_id[item.get("id")])
    ]
    extra = [item for item in live if item.get("id") not in repo_by_id]
    return {"missing": missing, "stale": stale, "extra": extra}


def commits_behind(live_sha):
    """How many commits main is ahead of the deployed sha, or None if unknown.

    Needs a full-history checkout (fetch-depth: 0). Any failure - shallow clone,
    sha not fetched, no git - is None rather than an exception: the count is a
    diagnostic, not the verdict.
    """
    if not live_sha or live_sha == "unknown":
        return None
    try:
        out = subprocess.run(
            ["git", "rev-list", "--count", f"{live_sha}..HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        return int(out.stdout.strip())
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


# --------------------------------------------------------------------------
# 2. Textual fallback (pre-/site-data/ deployments)
# --------------------------------------------------------------------------


def fetch_site():
    """The home page HTML, or (None, reason) when it cannot be read.

    The home page carries the full listing set in its RSC payload - every other
    data-backed route is a filtered view of the same load - so one request is
    enough.
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


# --------------------------------------------------------------------------
# 3. Visitor probe
# --------------------------------------------------------------------------


def classify_document_response(status, location):
    """(verdict, detail) for the first response to a browser-like GET /.

    verdict is "ok", "clerk_dev_instance", "redirect", or "error". The location
    header (or "") is only consulted for 3xx.
    """
    location = location or ""
    if status == 200:
        return "ok", ""
    if 300 <= status < 400:
        if ".clerk.accounts.dev" in location:
            return (
                "clerk_dev_instance",
                f"HTTP {status} to {location.split('?', 1)[0]}",
            )
        return "redirect", f"HTTP {status} to {location or '(no location header)'}"
    return "error", f"HTTP {status}"


def probe_document():
    """Request / the way a browser would, without following redirects."""
    try:
        r = requests.get(
            SITE_URL + "/", headers=HEADERS, timeout=TIMEOUT, allow_redirects=False
        )
    except requests.RequestException as e:
        return "error", f"request to {SITE_URL} failed: {e}"
    return classify_document_response(r.status_code, r.headers.get("location", ""))


CLERK_DEV_FIX = (
    "The live build was made with a Clerk DEVELOPMENT publishable key (pk_test_...),\n"
    "so every first visit is bounced through a dev-instance handshake, sign-in is\n"
    "broken and crawlers see a redirect. Whatever built this deployment had\n"
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set to a test key. Production deploys come\n"
    "from .github/workflows/deploy.yml, which builds from repository secrets and\n"
    "refuses a test key; a build from anywhere else (Cloudflare Workers Builds, a\n"
    "laptop with .env.local) is the suspect. See web/README.md -> Deployment."
)


# --------------------------------------------------------------------------


def emit_output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        # Heredoc form so a multi-line summary cannot break the file.
        f.write(f"{name}<<__EOF__\n{value}\n__EOF__\n")


def describe(item):
    return (
        f"  - {item.get('title') or item.get('name')}"
        f"  [{item.get('company_name', '?')}]  {item.get('url', '')}"
    )


DEPLOY_HINT = [
    "",
    "The site serves listing data frozen in at build time, so the deployment is",
    "older than listings.json. Deploys chain automatically off every workflow",
    "that pushes to main (.github/workflows/deploy.yml); if one did not run:",
    "",
    "  - Actions -> 'Deploy to Cloudflare' -> Run workflow (tick 'force' to",
    "    redeploy an unchanged main)",
    "  - By hand:   cd web && npm run deploy",
    "",
    "See web/README.md -> Deployment.",
]


def main():
    listings = load_listings()
    problems = []
    lines = []

    # --- data ------------------------------------------------------------
    build, live, error = fetch_site_data()
    if error == "unavailable":
        lines.append(
            f"{SITE_URL}/site-data/ is not served by this deployment (built before it "
            "existed); comparing against the home page HTML instead."
        )
        html, err = fetch_site()
        if err:
            problems.append(f"could not read the site - {err}")
        else:
            missing = missing_listings(listings, html)
            if missing:
                problems.append(
                    f"{len(missing)} of {len(listings)} listings are in the repository "
                    f"but NOT on {SITE_URL}"
                )
                lines.extend(describe(i) for i in missing)
                lines.extend(DEPLOY_HINT)
            else:
                lines.append(
                    f"All {len(listings)} listings in listings.json are live on {SITE_URL}."
                )
    elif error:
        problems.append(f"could not read the site - {error}")
    else:
        sha = str(build.get("sha", "unknown"))
        behind = commits_behind(sha)
        lines.append(
            f"Live build: {sha[:12]} built {build.get('builtAt', '?')}"
            + (f", {behind} commit(s) behind main" if behind is not None else "")
        )
        diff = diff_listings(listings, live)
        if diff["missing"]:
            problems.append(
                f"{len(diff['missing'])} of {len(listings)} listings are in the "
                f"repository but NOT on {SITE_URL}"
            )
            lines.append("Missing from the site:")
            lines.extend(describe(i) for i in diff["missing"])
        if diff["stale"]:
            problems.append(
                f"{len(diff['stale'])} listing(s) on {SITE_URL} differ from the repository"
            )
            lines.append("Stale on the site (repository has newer data):")
            lines.extend(describe(i) for i in diff["stale"])
        if diff["extra"]:
            problems.append(
                f"{len(diff['extra'])} listing(s) on {SITE_URL} are no longer in the repository"
            )
            lines.append("On the site but not in the repository:")
            lines.extend(describe(i) for i in diff["extra"])
        if diff["missing"] or diff["stale"] or diff["extra"]:
            lines.extend(DEPLOY_HINT)
        else:
            lines.append(
                f"All {len(listings)} listings in listings.json are live on {SITE_URL} "
                "and match the repository."
            )

    # --- visitor probe ----------------------------------------------------
    verdict, detail = probe_document()
    if verdict == "ok":
        lines.append(f"Visitor probe: {SITE_URL}/ answers 200 to a browser request.")
    elif verdict == "clerk_dev_instance":
        problems.append(
            f"{SITE_URL}/ redirects browsers to a Clerk development instance ({detail})"
        )
        lines.append("")
        lines.append(CLERK_DEV_FIX)
    elif verdict == "redirect":
        problems.append(f"{SITE_URL}/ redirects browsers instead of serving the page ({detail})")
    else:
        problems.append(f"{SITE_URL}/ is not serving the page to browsers ({detail})")

    summary = "\n".join(lines)
    print(summary)

    # A separate output for the one failure the workflow can act on by itself:
    # a build from another pipeline sitting on top of the last good deploy is
    # fixed by deploying again, so site_freshness.yml re-runs deploy.yml with
    # force when this is true. Everything else needs a person.
    emit_output("clerk_dev", "true" if verdict == "clerk_dev_instance" else "false")

    if not problems:
        emit_output("stale", "false")
        emit_output("summary", summary)
        return 0

    for p in problems:
        print(f"::error::{p}")
    emit_output("stale", "true")
    emit_output("summary", "\n".join(problems) + "\n\n" + summary)
    return 1


if __name__ == "__main__":
    sys.exit(main())
