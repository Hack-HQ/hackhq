# Gallery photos

Community photos from hackathons people found through this list.

## How a photo gets here

1. Someone opens a **Share a Hackathon Photo** issue (from the website gallery
   CTA or [the issue form](../../.github/ISSUE_TEMPLATE/gallery_photo.yaml))
   and attaches a JPG or PNG (max 5 MB).
2. A maintainer adds the `approved` label.
3. [`gallery_approved.yml`](../../.github/workflows/gallery_approved.yml) downloads
   the attachment, saves it here, appends
   [`.github/scripts/gallery.json`](../../.github/scripts/gallery.json), and
   rebuilds the README collage via `generate_gallery.py`.
4. The website infinite canvas reads `gallery.json` at build time
   (`web/scripts/prepare-repo-data.mjs`), so the new photo appears on the next
   deploy — no code change required.

## Filename convention

`hackathon-year-name.jpg` (or `.png`) — for example `hackmit-2026-jose.jpg`.
The approval bot slugifies the hackathon + credit fields automatically.

## gallery.json entry

```json
{
  "image": "assets/gallery/hackmit-2026-jose.jpg",
  "hackathon": "HackMIT 2026",
  "caption": "Demoing our project at 3am",
  "credit": "Jose Cruz",
  "credit_url": "https://www.linkedin.com/in/josegaelcruz"
}
```

Only `image` and `hackathon` are required. Use a roughly landscape or square
image so the grid stays tidy.
