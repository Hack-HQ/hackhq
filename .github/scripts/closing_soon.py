#!/usr/bin/env python3
"""
closing_soon.py — refresh the 🔥 [CLOSING SOON] badges in README.md.

A listing is closing soon when it is open and its act-by date is within
util.CLOSING_SOON_DAYS. The act-by date is the application deadline, or — when
no deadline is recorded — the event's own start date (or its end date, once the
event is already running). See util.urgency_date.

The badge is derived from the structured `deadline` / `startDate` / `endDate`
fields in listings.json, never from dates written into the Hackathon title. That
distinction is issue #70: the old text-scraping version read every date in the
row and mistook cuHacking's event dates for a registration deadline.

This regenerates the README's hackathon table from listings.json rather than
rewriting status cells in place, so the daily cron and the push-triggered
update_readmes.py run produce byte-identical output — including row order, which
puts closing-soon rows at the top, soonest first. Rewriting cells in place could
not do that: the row order lives in the generator, not in the README text.

Nothing is written back to listings.json. 'closing_soon' is a function of
today's date, so storing it would go stale the moment the date rolled over.

Idempotent — safe to run daily.
"""

import os

import update_readmes
import util

README = os.path.join(os.path.dirname(__file__), "..", "..", "README.md")

START_MARKER = "<!-- HACKATHONS_TABLE_START -->"
END_MARKER = "<!-- HACKATHONS_TABLE_END -->"


def status_by_row(table):
    """Map each row's non-status cells to its status cell.

    Keyed on the rest of the row rather than on position so that re-sorting the
    table — which this script now does — is not miscounted as a badge change.
    """
    out = {}
    for line in table.split("\n"):
        if not line.startswith("| ") or "Status |" in line:
            continue
        cells = util.split_table_cells(line)
        if len(cells) < 2 or set(cells[0]) <= {"-", " "}:
            continue
        out[tuple(cells[1:])] = cells[0]
    return out


def count_status_changes(before, after):
    """How many rows present in both tables changed status."""
    old = status_by_row(before)
    new = status_by_row(after)
    return sum(1 for row, status in new.items() if row in old and old[row] != status)


def extract_table(content):
    """Return the text currently between the table markers, or "" if absent."""
    start = content.find(START_MARKER)
    end = content.find(END_MARKER)
    if start == -1 or end == -1:
        return ""
    return content[start + len(START_MARKER):end]


def main():
    listings = util.get_listings_from_json()

    # Skip only the malformed listings, matching update_readmes.py: one bad
    # entry must not block the badge refresh for all the good ones.
    valid, errors = util.partition_valid_listings(listings)
    for err in errors:
        util.warn(err)
    listings = valid

    today = util.today_pst()
    visible = [l for l in listings if l.get("is_visible", True)]
    live = [l for l in util.sort_listings(visible, today)
            if util.resolve_state(l) != "closed"]

    with open(README, "r") as f:
        before = f.read()

    table = update_readmes.create_hackathons_table(live, today)
    util.embed_table(README, table, START_MARKER, END_MARKER)

    changed = count_status_changes(extract_table(before), table)

    # Refresh the live stats banner (status counts may have changed). Surface a
    # failure as a workflow annotation so a stale banner isn't shipped silently.
    try:
        import generate_banner
        generate_banner.main()
    except Exception as e:
        util.warn(f"could not regenerate stats banner (it may be stale): {e}")

    print(f"Updated {changed} row(s).")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"changes={changed}\n")


if __name__ == "__main__":
    main()
