#!/usr/bin/env python3
"""
Process approved contribution issues and update listings.

This script handles two types of contributions:
1. new_opportunity - Add a new hackathon to the listings
2. close_opportunity - Mark a hackathon as closed/inactive
"""

import json
import os
import sys
import re
import util


def get_first(data, *keys):
    """Return first non-empty string value for keys."""
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def handle_new_opportunity(data, username, is_quick_add=False):
    """Handle adding a new hackathon."""
    listings = util.get_listings_from_json()

    # Get URL - handle both full and quick templates
    url = get_first(data, "link_to_hackathon_page", "link", "link_to_hackathon")
    url = util.clean_url(url)
    if not url:
        util.fail("Missing required field: URL")

    # Check for duplicates
    for listing in listings:
        if listing["url"] == url:
            util.fail(f"Duplicate: This hackathon already exists (ID: {listing['id']})")

    # Get host name - handle both templates
    company_name = util.sanitize_field(get_first(data, "host/organizer", "host/organizer_name")) 

    # Get title - handle both templates
    title = util.sanitize_field(get_first(data, "hackathon_name", "hackathon_name/edition"))

    # Parse locations (default to "Online" if not provided)
    locations_str = get_first(data, "location", "location_(optional)")
    if locations_str:
        # Support semicolon, pipe, or newline as separators
        locations = [loc.strip() for loc in re.split(r'[;|\n]', locations_str) if loc.strip()]
    else:
        locations = ["Online"]

    # Get format (default In-Person)
    fmt = data.get("format", "In-Person").strip()
    if "Virtual" in fmt:
        fmt = "Virtual"
    elif "Hybrid" in fmt:
        fmt = "Hybrid"
    else:
        fmt = "In-Person"

    # Get prize (optional)
    prize = get_first(data, "prize_pool_(optional)", "prize") or "—"
    # Map user-submitted status/deadline fields into canonical listing fields.
    state = util.parse_state(data)
    deadline = util.parse_deadline(data, "deadline", "deadline_(optional)")

    # Create new listing
    new_listing = {
        "id": util.generate_uuid(),
        "company_name": company_name,
        "title": title,
        "url": url,
        "locations": locations,
        "format": fmt,
        "prize": prize,
        "state": state,
        "active": state != "closed",
        "is_visible": True,
        "date_posted": util.get_current_timestamp(),
        "date_updated": util.get_current_timestamp(),
        "source": username
    }
    if deadline:
        new_listing["deadline"] = deadline

    # Validate required fields
    if not new_listing["company_name"]:
        util.fail("Missing required field: Host/Organizer")
    if not new_listing["title"]:
        util.fail("Missing required field: Hackathon Name")

    listings.append(new_listing)
    util.save_listings_to_json(listings)

    # Set outputs
    util.set_output("commit_message", f"Add {company_name} - {title}")
    util.set_output("contributor_name", username)
    # Validate the contributor-supplied email before it reaches `git config`;
    # fall back to the bot address if it isn't a clean single-line address.
    email = get_first(data, "email_associated_with_your_github_account_(optional)")
    util.set_output("contributor_email", email if util.is_valid_email(email) else "actions@github.com")

    print(f"Successfully added: {company_name} - {title}")


def handle_close_opportunity(data, username):
    """Handle closing a hackathon."""
    listings = util.get_listings_from_json()

    company_name = data.get("host/organizer_name", "").strip()
    title = data.get("hackathon_name", "").strip()
    url = data.get("hackathon_url_(optional)", "").strip()

    if not company_name or not title:
        util.fail("Missing required fields: Host/Organizer and Hackathon Name")

    # Find matching listings
    matches = []
    for listing in listings:
        if (listing["company_name"].lower() == company_name.lower() and
            listing["title"].lower() == title.lower()):
            matches.append(listing)

    # If URL provided, filter by URL
    if url:
        url = util.clean_url(url)
        matches = [m for m in matches if m["url"] == url]

    if not matches:
        util.fail(f"Could not find hackathon: {company_name} - {title}")

    if len(matches) > 1:
        util.fail(f"Found multiple matches for {company_name} - {title}. Please provide the URL to identify the specific listing.")

    # Mark as inactive
    matches[0]["active"] = False
    matches[0]["date_updated"] = util.get_current_timestamp()

    util.save_listings_to_json(listings)

    util.set_output("commit_message", f"Close {company_name} - {title}")
    util.set_output("contributor_name", username)
    util.set_output("contributor_email", "actions@github.com")

    print(f"Successfully closed: {company_name} - {title}")


def main():
    if len(sys.argv) < 2:
        util.fail("Missing event data file path")

    event_path = sys.argv[1]
    with open(event_path, "r") as f:
        event = json.load(f)

    issue = event.get("issue", {})
    body = issue.get("body", "")
    labels = [l.get("name", "") for l in issue.get("labels", [])]
    username = issue.get("user", {}).get("login", "unknown")

    # Parse the issue body
    data = util.parse_issue_body(body)

    # Check if this is a quick add
    is_quick_add = "quick_add" in labels

    # Handle based on label
    if "new_opportunity" in labels:
        handle_new_opportunity(data, username, is_quick_add=is_quick_add)
    elif "close_opportunity" in labels:
        handle_close_opportunity(data, username)
    else:
        util.fail(f"Unknown issue type. Labels: {labels}")


if __name__ == "__main__":
    main()
