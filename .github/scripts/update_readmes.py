#!/usr/bin/env python3
"""
Update README.md with the latest hackathons from listings.json.

This script reads the listings data, generates the markdown table,
and embeds it in the README file between the marker comments.
"""

import os
from datetime import datetime
import util


def main():
    try:
        # Load listings
        listings = util.get_listings_from_json()

        # Validate schema
        util.check_schema(listings)

        # Only visible listings
        hackathons = [l for l in listings if l.get("is_visible", True)]

        # Sort listings
        hackathons = util.sort_listings(hackathons)

        # Generate table
        hackathons_table = create_hackathons_table(hackathons)

        # Get README path
        readme_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "..",
            "README.md"
        )

        # Embed table in README
        util.embed_table(
            readme_path,
            hackathons_table,
            "<!-- HACKATHONS_TABLE_START -->",
            "<!-- HACKATHONS_TABLE_END -->"
        )

        # Regenerate the live stats banner from the freshly written table
        try:
            import generate_banner
            generate_banner.main()
        except Exception as e:
            print(f"Warning: could not regenerate banner: {e}")

        # Set commit message
        now = datetime.now(util.PST)
        timestamp = now.strftime("%Y-%m-%d %H:%M PST")
        util.set_output("commit_message", f"Update README ({timestamp})")

        print(f"Successfully updated README:")
        print(f"  - {len(hackathons)} hackathons")

    except Exception as e:
        util.fail(str(e))


def create_hackathons_table(listings):
    """Create a table for hackathons."""
    rows = []
    header = "| Status | Host | Hackathon | Format | Location | Prize | Application | Date Posted |"
    separator = "| ------ | ---- | --------- | ------ | -------- | ----- | ----------- | ----------- |"
    rows.append(header)
    rows.append(separator)

    for listing in listings:
        active = listing.get("active", True)
        status = util.get_status_badge(active)
        host = util.sanitize_table_cell(listing["company_name"])
        title = util.sanitize_table_cell(listing["title"])
        fmt = util.sanitize_table_cell(listing.get("format", ""))
        location = util.format_locations(listing.get("locations", []))
        prize = util.sanitize_table_cell(listing.get("prize", "—"))
        link = util.format_link(listing["url"]) if active else ":lock:"
        date = util.format_date(listing["date_posted"])

        row = f"| {status} | {host} | {title} | {fmt} | {location} | {prize} | {link} | {date} |"
        rows.append(row)

    return "\n".join(rows)


if __name__ == "__main__":
    main()
