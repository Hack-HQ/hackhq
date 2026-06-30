# Contributing to Hackathons

Thank you for your interest in contributing! This repository aims to be a single, always-current list of hackathons worth attending.

## How to Add a Hackathon

### Just Paste the Link! (Recommended)

The easiest way to contribute:

1. Go to **Issues** → **New Issue**
2. Select **"Add Hackathon (Just Paste Link)"**
3. Paste the URL to the hackathon
4. Submit!

**That's it!** AI will automatically extract:
- Host / organizer
- Hackathon name
- Location
- Format (In-Person / Virtual / Hybrid)
- Prize pool

### Alternative Methods

| Template | When to Use |
|----------|-------------|
| **Just Paste Link** | Default - paste URL, AI extracts everything |
| **Quick Add** | If AI extraction fails, manually fill a few fields |
| **New Hackathon** | Want full control over all details |

---

## What Qualifies as a Hackathon?

This repository is **specifically for hackathons** — time-boxed events where people build projects, usually over a weekend or a few days.

### Examples of What We Include

- **Collegiate hackathons** like HackMIT, PennApps, Cal Hacks, TreeHacks
- **MLH member events** and Global Hack Week
- **Virtual / online hackathons** open to anyone
- **High-school hackathons** and beginner-friendly events
- **Datathons, game jams, and build competitions** that follow the hackathon format

### What Does NOT Belong Here

- **Internships, fellowships, or jobs** — these are not hackathons
- **General tech conferences** without a build competition
- **Paid bootcamps or courses**

---

## Format

Every hackathon is tagged with one format:

| Format | Description |
|--------|-------------|
| **In-Person** | Attendees build on-site at a physical venue |
| **Virtual** | Fully online — participate from anywhere |
| **Hybrid** | Both in-person and online participation |

---

## Closing or Editing a Hackathon

### Closing (Registration No Longer Open)

1. Go to **Issues** → **New Issue**
2. Select **Close Hackathon**
3. Provide host/organizer and hackathon name
4. Submit

### Editing (Information Changed)

Editing via issues is not currently supported. To update a listing:
1. Open a **Close Hackathon** issue to remove the old listing
2. Open a new **Add Hackathon** issue with the corrected details

---

## Featuring a Hackathon (Maintainers)

Featured hackathons are the team-curated "don't miss these" picks. They get a ⭐ in the README, pin to the top of the list, and show a Featured badge and filter on the website.

This is **team-curated featuring** (a flag maintainers set), not per-user saved favorites.

To feature a hackathon:

1. Open [`.github/scripts/listings.json`](.github/scripts/listings.json) and find the entry.
2. Add `"featured": true` to it (omit the field or set `false` to un-feature):

```json
{
  "company_name": "MIT",
  "title": "HackMIT 2026 ...",
  "url": "https://hackmit.org/",
  "featured": true
}
```

3. Commit / open a PR. The README and website are regenerated automatically — featured entries get a ⭐ and are pinned to the top.

Keep the featured set small so it stays meaningful.

---

## How the Automation Works

1. **User submits** a link via the issue template
2. **Maintainer reviews** and adds the `approved` label
3. **AI extracts** host, hackathon name, location, format, prize, etc. from the page
4. **Automation adds** the hackathon to the table
5. **Issue is closed** with a summary of what was added

---

## Guidelines

- **Search existing issues** before submitting to avoid duplicates
- **Verify the event** is actually a hackathon
- **Use official links** - no referral links or affiliate URLs
- Be respectful and help maintain accurate information

---

Thank you for helping people find great hackathons!
