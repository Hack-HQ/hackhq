#!/usr/bin/env python3
"""
seed_supabase.py — push listings.json into the Supabase `hackathons` table (issue #11).

Maps each listing to a table row and upserts on the `id` primary key, so re-runs
are idempotent. The sync Action (#13) imports `build_row` and `upsert` from here
rather than reimplementing the mapping.

Geo columns (`lat`, `lng`, `geo_status`) are left unset; the geocoder (#12) fills them.

Requires two environment variables:
  SUPABASE_URL          e.g. https://<ref>.supabase.co
  SUPABASE_SERVICE_KEY  service_role key — bypasses RLS, so writes are allowed

The service key is never logged. Response bodies are echoed on failure; PostgREST
does not include credentials in error payloads.

Run with:  python .github/scripts/seed_supabase.py
"""

import json
import os
import sys
from datetime import datetime, timezone

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LISTINGS_FILE = os.path.join(SCRIPT_DIR, "listings.json")

TABLE = "hackathons"
CHUNK_SIZE = 100
TIMEOUT = 30


def utc_now_iso():
    """Current UTC instant as an ISO-8601 string Postgres reads as timestamptz."""
    return datetime.now(timezone.utc).isoformat()


def build_row(listing, synced_at=None):
    """Translate one listings.json entry into a `hackathons` table row.

    `company_name` is stored as `host`. Absent `deadline` stays NULL; absent
    `featured` becomes False so the column is never NULL for the site's filters.

    `synced_at` defaults to now. Pass one stamp for a whole run so every row
    written by the same sync carries the same instant, which is what makes
    "which rows did the last run touch" answerable.
    """
    return {
        "id": listing["id"],
        "host": listing["company_name"],
        "title": listing["title"],
        "url": listing["url"],
        "locations": listing.get("locations", []),
        "format": listing.get("format"),
        "prize": listing.get("prize"),
        "state": listing.get("state"),
        "active": listing.get("active", True),
        "is_visible": listing.get("is_visible", True),
        "date_posted": listing.get("date_posted"),
        "date_updated": listing.get("date_updated"),
        "source": listing.get("source"),
        "deadline": listing.get("deadline"),
        "startDate": listing.get("startDate"),
        "endDate": listing.get("endDate"),
        "featured": bool(listing.get("featured", False)),
        # The column defaults to now() on INSERT, but the upsert's UPDATE path
        # never touched it, so a re-synced row kept the timestamp of the very
        # first insert forever. Sending it on every write makes the name true:
        # the last time the sync wrote this row, not the first.
        "synced_at": synced_at or utc_now_iso(),
        # Declares which write path produced this row. Rows a user submits
        # through the site carry origin='user' instead. The upsert below does
        # not filter on it and does not need to: the
        # hackathons_skip_sync_over_user_rows BEFORE UPDATE trigger, added in
        # supabase/migrations/20260722154046_enforce_conflict_rule.sql, discards
        # any update that would flip an origin='user' row to 'listings_json'.
        # Triggers are not bypassed by service_role the way RLS is, so that
        # holds for this script too.
        "origin": "listings_json",
    }


def upsert(rows, base_url, service_key):
    """Upsert rows into `hackathons`, chunked. Raises on any non-2xx response."""
    endpoint = f"{base_url.rstrip('/')}/rest/v1/{TABLE}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    for start in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[start : start + CHUNK_SIZE]
        response = requests.post(endpoint, headers=headers, json=chunk, timeout=TIMEOUT)
        if not response.ok:
            raise RuntimeError(
                f"upsert failed at row {start} with HTTP {response.status_code}: {response.text}"
            )
        print(f"upserted rows {start}-{start + len(chunk) - 1}")


def main():
    base_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not base_url or not service_key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

    with open(LISTINGS_FILE, encoding="utf-8") as handle:
        listings = json.load(handle)

    stamp = utc_now_iso()
    rows = [build_row(listing, synced_at=stamp) for listing in listings]
    upsert(rows, base_url, service_key)
    print(f"seeded {len(rows)} listings into {TABLE}")


if __name__ == "__main__":
    main()
