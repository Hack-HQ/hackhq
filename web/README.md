# HackHQ Web

The web frontend for **HackHQ** — a browsable, searchable interface for the
hackathon listings maintained in the repository root
[`../README.md`](../README.md).

It's a [Next.js](https://nextjs.org) (App Router) app that renders the listings
as a filterable directory, with a live stats banner and a community photo
gallery.

## What it does

- **Browse & search** every tracked hackathon by host, name, format, or location.
- **Filter by status** — Open, Closing Soon, and Opens Soon — with live counts.
- **Sort intelligently** — closing-soon events first, then by nearest deadline.
- **Stats banner** — an at-a-glance snapshot of totals (tracked, open, opens
  soon, closing soon) and format breakdown.
- **Gallery** — real photos from hackathons people found through the list.

## How it works

This app has **no database**. The repository root `README.md` is the single
source of truth, and the app parses it at request time.

On each render, `lib/parse-readme.ts` reads `../README.md` and extracts:

| Content       | Source in `../README.md`                                              |
| ------------- | -------------------------------------------------------------------- |
| Listings      | Table rows between `<!-- HACKATHONS_TABLE_START -->` and `<!-- HACKATHONS_TABLE_END -->` |
| Stats banner  | The `<img alt="Hackathon stats" ...>` tag                            |
| Gallery       | `<img>` tags between `<!-- GALLERY_START -->` and `<!-- GALLERY_END -->` |

Because parsing happens at runtime, **any update to the root `README.md` is
reflected on the next render** — no rebuild required in development.

### Assets

Images referenced in the README (e.g. `assets/hackathons-banner.svg`) are
resolved by `resolveAssetSrc()` in `lib/parse-readme.ts`:

1. **Local first** — if the file exists under `../assets/`, it's served by the
   route handler at `app/repo-assets/[...path]/route.ts`. This keeps the UI in
   sync with your current branch/working tree.
2. **Remote fallback** — otherwise it falls back to the file on `main` via
   `raw.githubusercontent.com`.

Local assets are preferred so the stats banner always matches the counts parsed
from your local `README.md`.

## Project structure

```text
web/
├── app/
│   ├── page.tsx                     # Home page; loads data via loadSiteData()
│   ├── layout.tsx                   # Root layout & metadata
│   └── repo-assets/[...path]/route.ts  # Serves files from ../assets
├── components/
│   ├── browser.tsx                  # Search, filters, results grid (client)
│   ├── opportunity-card.tsx         # Single listing card
│   ├── stats-banner.tsx             # Stats banner image
│   └── gallery.tsx                  # Photo gallery
└── lib/
    ├── parse-readme.ts              # Parses ../README.md into typed data
    └── types.ts                     # Opportunity / GalleryPhoto types
```

## Getting started

> Requires **Node.js >= 20.9.0**.

This app must be run from the `web/` directory so that `../README.md` and
`../assets/` resolve correctly.

```bash
cd web
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script          | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the development server         |
| `npm run build` | Create a production build            |
| `npm run start` | Serve the production build           |
| `npm run lint`  | Run ESLint                           |

## Production build

```bash
npm run build
npm run start
```

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router)
- [React 19](https://react.dev)
- [Tailwind CSS 4](https://tailwindcss.com)
- TypeScript

## Notes

- Listings, stats, and gallery are derived from `../README.md`; edit that file
  (or the generator scripts in `.github/scripts/`) to change what's shown here.
- `next.config.ts` allows optimized `raw.githubusercontent.com` images and the
  inline SVG banner.
