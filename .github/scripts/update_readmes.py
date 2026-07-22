#!/usr/bin/env python3
"""
Update README.md and ARCHIVE.md with the latest hackathons from listings.json.

This script reads the listings data, generates the markdown tables, and embeds
them between the marker comments: live hackathons go to README.md, closed ones
to ARCHIVE.md. listings.json stays the single source of truth — a listing is
archived purely by being marked closed (state="closed" / active=False), which is
what the close_opportunity issue flow already does.
"""

import os
from datetime import datetime
import util


def main():
    try:
        # Load listings
        listings = util.get_listings_from_json()

        # Validate schema. Skip only the malformed listings (with a warning
        # annotation) so a single bad entry can't block regeneration of the
        # README/banner/gallery for all the good ones.
        valid, errors = util.partition_valid_listings(listings)
        for err in errors:
            util.warn(err)
        skipped = len(listings) - len(valid)
        if skipped:
            util.warn(
                f"Skipped {skipped} invalid listing(s); regenerating from the "
                f"remaining {len(valid)}."
            )
        listings = valid

        # Only visible listings
        hackathons = [l for l in listings if l.get("is_visible", True)]

        # Sort listings
        hackathons = util.sort_listings(hackathons)

        # Split live from closed. A closed hackathon belongs in ARCHIVE.md, not
        # the README — otherwise every past event accumulates in the main table
        # and the archive stays empty (which is what happened before this split).
        live = [l for l in hackathons if util.resolve_state(l) != "closed"]
        closed = [l for l in hackathons if util.resolve_state(l) == "closed"]

        repo_root = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", ".."
        )

        # Embed the live table in README
        util.embed_table(
            os.path.join(repo_root, "README.md"),
            create_hackathons_table(live),
            "<!-- HACKATHONS_TABLE_START -->",
            "<!-- HACKATHONS_TABLE_END -->"
        )

        # Embed the closed table in ARCHIVE
        util.embed_table(
            os.path.join(repo_root, "ARCHIVE.md"),
            create_archive_table(closed),
            "<!-- ARCHIVE_TABLE_START -->",
            "<!-- ARCHIVE_TABLE_END -->"
        )

        # Regenerate the live stats banner from the freshly written table.
        # Surface failures as workflow annotations so a stale banner isn't
        # committed silently.
        try:
            import generate_banner
            generate_banner.main()
        except Exception as e:
            util.warn(f"could not regenerate stats banner (it may be stale): {e}")

        # Rebuild the community photo gallery
        try:
            import generate_gallery
            generate_gallery.main()
        except Exception as e:
            util.warn(f"could not regenerate photo gallery (it may be stale): {e}")

        # Set commit message
        now = datetime.now(util.PST)
        timestamp = now.strftime("%Y-%m-%d %H:%M PST")
        util.set_output("commit_message", f"Update README + ARCHIVE ({timestamp})")

        print(f"Successfully updated README and ARCHIVE:")
        print(f"  - {len(live)} live hackathons (README.md)")
        print(f"  - {len(closed)} archived hackathons (ARCHIVE.md)")

    except Exception as e:
        util.fail(str(e))


def create_hackathons_table(listings):
    """Create a table for hackathons."""
    rows = []
    header = "| Status | Host | Hackathon | Format | Location | Prize | Deadline | Application | Date Posted |"
    separator = "| ------ | ---- | --------- | ------ | -------- | ----- | -------- | ----------- | ----------- |"
    rows.append(header)
    rows.append(separator)

    for listing in listings:
        state = util.resolve_state(listing)
        host = util.sanitize_table_cell(listing["company_name"])
        title = util.sanitize_table_cell(listing["title"])
        if util.is_featured(listing):
            title = f"⭐ {title}"
        fmt = util.sanitize_table_cell(listing.get("format", ""))
        location = util.format_locations(listing.get("locations", []))
        prize = util.sanitize_table_cell(listing.get("prize", "—"))
        deadline = util.sanitize_table_cell(util.format_deadline(listing.get("deadline")))
        date = util.format_date(listing["date_posted"])

        if state == "opens_soon":
            status = "⏳ **[OPENS SOON]**"
            link = util.format_website_link(listing["url"])
        elif state == "closed":
            status = "🔒 **[CLOSED]**"
            link = ":lock:"
        else:
            status = "✅ **[OPEN]**"
            link = util.format_link(listing["url"])

        row = f"| {status} | {host} | {title} | {fmt} | {location} | {prize} | {deadline} | {link} | {date} |"
        rows.append(row)

    return "\n".join(rows)


def create_archive_table(listings):
    """Create the ARCHIVE.md table for closed hackathons.

    Narrower than the README table: a closed listing has no live application
    link (always :lock:) so Prize/Deadline are dropped and the columns match the
    header ARCHIVE.md already declares.
    """
    rows = []
    header = "| Status | Host | Hackathon | Format | Location | Application | Date Posted |"
    separator = "| ------ | ---- | --------- | ------ | -------- | ----------- | ----------- |"
    rows.append(header)
    rows.append(separator)

    for listing in listings:
        host = util.sanitize_table_cell(listing["company_name"])
        title = util.sanitize_table_cell(listing["title"])
        if util.is_featured(listing):
            title = f"⭐ {title}"
        fmt = util.sanitize_table_cell(listing.get("format", ""))
        location = util.format_locations(listing.get("locations", []))
        date = util.format_date(listing["date_posted"])

        row = f"| 🔒 **[CLOSED]** | {host} | {title} | {fmt} | {location} | :lock: | {date} |"
        rows.append(row)

    return "\n".join(rows)


if __name__ == "__main__":
    main()
