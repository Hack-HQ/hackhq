#!/usr/bin/env python3
"""
generate_gallery.py — render the community photo gallery into README.md.

Reads .github/scripts/gallery.json (a list of submitted photos) and writes a
responsive 3-column grid between the <!-- GALLERY_START --> / <!-- GALLERY_END -->
markers. Photos are committed under assets/gallery/.

Each gallery.json entry:
{
  "image": "assets/gallery/hackmit-2026-jose.jpg",
  "hackathon": "HackMIT 2026",
  "caption": "Demoing our project at 3am",
  "credit": "Jose Cruz",
  "credit_url": "https://www.linkedin.com/in/josegaelcruz"
}
Only "image" and "hackathon" are required.
"""

import os
import json
import util

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GALLERY_FILE = os.path.join(SCRIPT_DIR, "gallery.json")
README = os.path.join(SCRIPT_DIR, "..", "..", "README.md")
START = "<!-- GALLERY_START -->"
END = "<!-- GALLERY_END -->"
ROW_HEIGHT = 175  # px — every photo is scaled to this height so they pack into a justified collage


def load_gallery():
    if not os.path.exists(GALLERY_FILE):
        return []
    with open(GALLERY_FILE, "r") as f:
        return json.load(f)


def esc(text):
    # Escape &, <, >, " and ' so a value containing a quote cannot break out of
    # the href/src/alt attributes below.
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def tile(photo):
    image = esc(photo["image"])
    hackathon = esc(photo.get("hackathon", ""))
    # Fixed height + no width keeps each photo's aspect ratio, so they tile
    # together like a collage instead of sitting in separate boxes.
    return (
        f'<a href="{image}">'
        f'<img src="{image}" height="{ROW_HEIGHT}" alt="{hackathon}"></a>'
    )


def build_grid(photos):
    if not photos:
        return (
            "<p align=\"center\"><i>No photos yet. Be the first — "
            "share a shot from a hackathon you found here!</i></p>"
        )
    tiles = "\n".join(tile(p) for p in photos)
    return f'<p align="center">\n{tiles}\n</p>'


def main():
    photos = load_gallery()
    grid = build_grid(photos)
    util.embed_table(README, grid, START, END)
    print(f"Gallery updated: {len(photos)} photo(s).")


if __name__ == "__main__":
    main()
