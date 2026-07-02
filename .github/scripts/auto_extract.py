#!/usr/bin/env python3
"""
Auto-extract hackathon details from a URL using AI.

This script:
1. Fetches the webpage content
2. Uses OpenAI API to extract structured data
3. Adds the hackathon to listings.json
"""

import json
import os
import sys
import re
import requests
from bs4 import BeautifulSoup
import util

# Try to import OpenAI
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


def fetch_page_content(url):
    """Fetch and parse webpage content."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        try:
            response = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
        except requests.exceptions.SSLError:
            print(f"SSL verification failed for {url}, retrying without verification...")
            response = requests.get(url, headers=headers, timeout=30, allow_redirects=True, verify=False)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Extract metadata before removing elements
        meta_description = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag:
            meta_description = meta_tag.get("content", "")
        og_title = ""
        og_tag = soup.find("meta", attrs={"property": "og:title"})
        if og_tag:
            og_title = og_tag.get("content", "")
        og_desc = ""
        og_desc_tag = soup.find("meta", attrs={"property": "og:description"})
        if og_desc_tag:
            og_desc = og_desc_tag.get("content", "")

        # Extract JSON-LD structured data (many event sites embed this)
        json_ld_text = ""
        for script_tag in soup.find_all("script", type="application/ld+json"):
            try:
                ld_data = json.loads(script_tag.string or "")
                json_ld_text = json.dumps(ld_data, indent=2)[:4000]
            except (json.JSONDecodeError, TypeError):
                pass

        title_tag = soup.find("title")
        page_title = title_tag.get_text() if title_tag else og_title

        # Remove non-content elements
        for el in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
            el.decompose()

        text = soup.get_text(separator="\n", strip=True)

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        text = "\n".join(lines)

        # Prepend metadata for better AI extraction context
        metadata_parts = []
        if meta_description:
            metadata_parts.append(f"Meta Description: {meta_description}")
        if og_title and og_title != page_title:
            metadata_parts.append(f"OG Title: {og_title}")
        if og_desc and og_desc != meta_description:
            metadata_parts.append(f"OG Description: {og_desc}")
        if json_ld_text:
            metadata_parts.append(f"Structured Data:\n{json_ld_text}")

        if metadata_parts:
            metadata_block = "\n".join(metadata_parts) + "\n\n---\n\n"
            text = metadata_block + text

        if len(text) > 12000:
            text = text[:12000] + "\n...[truncated]"

        # If very little text was extracted, the page likely requires JS rendering
        if len(text.strip()) < 200:
            text = (
                f"[Page requires JavaScript to render. Limited content available.]\n"
                f"URL: {url}\n"
                f"Page Title: {page_title}\n"
                f"Meta Description: {meta_description}\n"
                f"OG Title: {og_title}\n"
                f"OG Description: {og_desc}\n"
                f"{text}"
            )

        return {
            "text": text,
            "title": page_title,
            "url": url
        }

    except Exception as e:
        return {
            "text": f"Error fetching page: {str(e)}",
            "title": "",
            "url": url,
            "error": str(e)
        }


def extract_with_openai(page_content, additional_notes=""):
    """Use OpenAI to extract structured data from page content."""
    if not HAS_OPENAI:
        util.fail("OpenAI library not installed. Run: pip install openai")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        util.fail("OPENAI_API_KEY environment variable not set. Add it as a repository secret.")

    client = OpenAI(api_key=api_key)

    prompt = f"""Analyze this hackathon listing/event page and extract the following information.
This is for a repository that tracks HACKATHONS (coding events / build competitions).

Page Title: {page_content['title']}
URL: {page_content['url']}
Additional Notes from submitter: {additional_notes}

Page Content:
{page_content['text']}

---

Extract and return a JSON object with these fields:
- company_name: The host or organizer of the hackathon (e.g., "MIT", "Major League Hacking", "UC Berkeley"). Extract from the URL domain if not found in content.
- title: The hackathon name (e.g., "HackMIT 2026", "PennApps XXVI", "TreeHacks"). Include the year/edition if available.
- locations: Array of locations (e.g., ["Cambridge, MA"], ["Online"]). Use ["Online"] for fully virtual events.
- format: One of "In-Person", "Virtual", or "Hybrid"
- prize: The prize pool or rewards if mentioned (e.g., "$50K in prizes", "Swag + prizes"). Use "—" if not specified.
- is_hackathon: true if this page is for a hackathon / coding event / build competition, false otherwise

For is_hackathon: set to true if the posting mentions a hackathon, hack day, build competition, coding marathon, datathon, or similar event. Set to false only if it is clearly not a hackathon (e.g., a job posting or general conference).

If the page content is limited (JavaScript-rendered page), do your best to extract from the URL, page title, meta descriptions, and any available structured data. Make reasonable inferences for the host name from the URL domain.

Return ONLY valid JSON, no other text."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured data from hackathon listings. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=1000
        )

        result_text = response.choices[0].message.content.strip()

        # Clean up markdown code blocks if present
        if result_text.startswith("```"):
            result_text = re.sub(r"^```json?\n?", "", result_text)
            result_text = re.sub(r"\n?```$", "", result_text)

        return json.loads(result_text)

    except json.JSONDecodeError as e:
        util.fail(f"Failed to parse AI response as JSON: {e}\nResponse: {result_text}")
    except Exception as e:
        util.fail(f"OpenAI API error: {str(e)}")


def parse_issue_body(body):
    """Parse the issue body to get URL and notes."""
    lines = body.strip().split("\n")
    data = {}

    current_field = None
    current_value = []

    for line in lines:
        if line.startswith("### "):
            if current_field and current_value:
                data[current_field] = "\n".join(current_value).strip()
            # Convert "Link to Hackathon" -> "link_to_hackathon"
            current_field = line[4:].strip().lower().replace(" ", "_").replace("?", "").replace("(", "").replace(")", "")
            current_value = []
        elif current_field:
            if line.strip() and line.strip() != "_No response_":
                current_value.append(line)

    if current_field and current_value:
        data[current_field] = "\n".join(current_value).strip()

    return data


def parse_state(data):
    """Map optional issue status field to listing state."""
    status = (data.get("status", "") or "").strip().lower()
    if "soon" in status:
        return "opens_soon"
    if "open" in status:
        return "open"
    # Sensible default for auto-extracted listings.
    return "open"


def parse_deadline(data):
    """Parse optional deadline and normalize to ISO YYYY-MM-DD."""
    raw = (data.get("deadline_optional", "") or data.get("deadline", "")).strip()
    if not raw:
        return None
    try:
        return util.parse_deadline_date(raw).isoformat()
    except ValueError:
        util.fail("Invalid deadline format. Please use YYYY-MM-DD or MM/DD/YYYY.")


def extract_url_from_body(body):
    """Try multiple methods to extract URL from issue body."""
    # Method 1: Parse structured fields
    data = parse_issue_body(body)

    # Try various field names
    url_fields = [
        "link_to_hackathon",
        "link_to_opportunity",
        "link",
        "url",
        "link_to_hackathon_page",
        "application_link"
    ]

    for field in url_fields:
        if field in data and data[field]:
            url = data[field].strip()
            if url.startswith("http"):
                return url, data

    # Method 2: Find any URL in the body
    url_pattern = r'https?://[^\s<>"\')\]]+'
    matches = re.findall(url_pattern, body)
    if matches:
        return matches[0], data

    return None, data


def main():
    if len(sys.argv) < 2:
        util.fail("Missing event data file path")

    event_path = sys.argv[1]

    print(f"Reading event from: {event_path}")

    with open(event_path, "r") as f:
        event = json.load(f)

    issue = event.get("issue", {})
    body = issue.get("body", "")
    username = issue.get("user", {}).get("login", "unknown")

    print(f"Issue body:\n{body}\n")

    # Extract URL from body
    url, data = extract_url_from_body(body)

    if not url:
        util.fail("No URL found in issue body. Please make sure to include a valid URL.")

    url = util.clean_url(url)
    print(f"Extracted URL: {url}")

    notes = data.get("any_additional_context_optional", "") or data.get("notes", "")
    state = parse_state(data)
    deadline = parse_deadline(data)

    print(f"Fetching content from: {url}")

    # Fetch page content
    page_content = fetch_page_content(url)

    if "error" in page_content:
        util.fail(f"Failed to fetch page: {page_content['error']}")

    print(f"Page title: {page_content['title']}")
    print(f"Content length: {len(page_content['text'])} chars")
    print("Extracting details with AI...")

    # Extract with AI
    extracted = extract_with_openai(page_content, notes)

    print(f"Extracted: {json.dumps(extracted, indent=2)}")

    # Validate extracted data
    company_name = extracted.get("company_name", "").strip()
    title = extracted.get("title", "").strip()
    locations = extracted.get("locations", [])
    fmt = extracted.get("format", "")

    if not company_name or company_name == "Unknown":
        util.fail("AI extraction failed: could not determine the host/organizer. Please use the Quick Add template instead.")
    if not title or title == "Unknown":
        util.fail("AI extraction failed: could not determine the hackathon name. Please use the Quick Add template instead.")
    if not isinstance(locations, list) or len(locations) == 0:
        locations = ["Online"]
    if fmt not in util.VALID_FORMATS:
        fmt = "In-Person"

    # Sanitize locations — remove any that look like URLs or HTML
    clean_locations = []
    for loc in locations:
        loc = loc.strip()
        if loc and not loc.startswith("http") and "<" not in loc:
            clean_locations.append(loc)
    if not clean_locations:
        clean_locations = ["Online"]
    locations = clean_locations

    # Warn if not confirmed as a hackathon, but still proceed
    # since a maintainer already approved the issue
    warning_msg = ""
    if not extracted.get("is_hackathon", False):
        warning_msg = "AI did not confirm this is a hackathon. A maintainer approved it, so it was added anyway. Please verify and remove if incorrect."
        print(f"WARNING: {warning_msg}")

    # Check for duplicates (by URL or by host+title)
    listings = util.get_listings_from_json()
    for listing in listings:
        if listing["url"] == url:
            util.set_output("is_duplicate", "true")
            util.set_output("duplicate_id", listing["id"])
            util.set_output("duplicate_reason", f"This URL already exists in the repository")
            util.set_output("commit_message", "")
            print(f"DUPLICATE DETECTED: URL already exists (ID: {listing['id']})")
            sys.exit(0)
        if (listing["company_name"].lower() == company_name.lower() and
                listing["title"].lower() == title.lower()):
            util.set_output("is_duplicate", "true")
            util.set_output("duplicate_id", listing["id"])
            util.set_output("duplicate_reason", f"'{company_name} - {title}' already exists in the repository")
            util.set_output("commit_message", "")
            print(f"DUPLICATE DETECTED: {company_name} - {title} already exists (ID: {listing['id']})")
            sys.exit(0)

    # Create the listing
    new_listing = {
        "id": util.generate_uuid(),
        "company_name": company_name,
        "title": title,
        "url": url,
        "locations": locations,
        "format": fmt,
        "prize": extracted.get("prize", "—") or "—",
        "state": state,
        "active": state != "closed",
        "is_visible": True,
        "date_posted": util.get_current_timestamp(),
        "date_updated": util.get_current_timestamp(),
        "source": username
    }
    if deadline:
        new_listing["deadline"] = deadline

    # Save
    listings.append(new_listing)
    util.save_listings_to_json(listings)

    # Set outputs
    company = new_listing["company_name"]
    title = new_listing["title"]
    util.set_output("commit_message", f"Add {company} - {title}")
    util.set_output("contributor_name", username)
    util.set_output("contributor_email", "actions@github.com")
    util.set_output("extracted_data", json.dumps(extracted))
    if warning_msg:
        util.set_output("warning", warning_msg)

    print(f"Successfully added: {company} - {title}")


if __name__ == "__main__":
    main()
