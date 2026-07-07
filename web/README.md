# HackHQ Web

The web frontend for **HackHQ** — a browsable interface for the hackathon
listings maintained in this repository.

It's a [Next.js](https://nextjs.org) (App Router) app with a 3D globe, card
deck, and member tracker, plus a legacy searchable directory at `/hackathons`.

## What it does

- **Home (`/`)** — hero, stats, and entry points into the globe and deck.
- **Globe (`/globe`)** — 3D Mapbox map with status-colored markers.
- **Deck (`/deck`)** — flip through hackathons as tactile cards or a dense list.
- **My HackHQ (`/my`)** — personal tracker pipeline (optional Clerk sign-in).
- **All hackathons (`/hackathons`)** — legacy README-driven search and filters.

## How it works

This app has **no database**. Listing data lives in the repo and is read from
disk when pages are generated.

### Data sources

| Route(s) | Loader | Source file |
| -------- | ------ | ----------- |
| `/`, `/deck`, `/globe`, `/my` | `loadHackathons()` in `lib/listings.ts` | `../.github/scripts/listings.json` |
| `/hackathons` | `loadSiteData()` in `lib/parse-readme.ts` | `../README.md` (table + stats banner) |

`listings.json` is the source of truth for the main HackHQ experience.
`parse-readme.ts` still powers the legacy `/hackathons` page, which parses the
README table between `<!-- HACKATHONS_TABLE_START -->` and
`<!-- HACKATHONS_TABLE_END -->`.

### Render model

Production pages are **statically generated at build time** (`next build`).
Both loaders use `fs.readFileSync` during that build step, so listing data,
deadline-derived status, and counts are baked into the HTML/JSON payload when
the site is built — not on each visitor request.

| Route | Production render mode |
| ----- | ---------------------- |
| `/`, `/deck`, `/globe`, `/my`, `/hackathons` | Static (prerendered) |
| `/repo-assets/[...path]` | Dynamic (serves files from `../assets/` on demand) |

**Development (`npm run dev`)** differs: Next.js re-executes server components
when you refresh or when files change, so edits to `listings.json` or
`README.md` show up without a full rebuild. In production, changes to those
files require a new deploy/build to appear on the site.

### Assets

Images referenced in the README (e.g. `assets/hackathons-banner.svg`) are
resolved by `resolveAssetSrc()` in `lib/parse-readme.ts`:

1. **Local first** — if the file exists under `../assets/`, it's served by the
   route handler at `app/repo-assets/[...path]/route.ts`.
2. **Remote fallback** — otherwise it falls back to the file on `main` via
   `raw.githubusercontent.com`.

## Project structure

```text
web/
├── app/
│   ├── page.tsx                       # Home; loadHackathons() + HomeClient
│   ├── globe/page.tsx                 # 3D globe
│   ├── deck/page.tsx                  # Card deck
│   ├── my/page.tsx                    # Member tracker hub
│   ├── hackathons/page.tsx            # Legacy README browser
│   ├── layout.tsx                     # Root layout, fonts, optional ClerkProvider
│   └── repo-assets/[...path]/route.ts # Serves files from ../assets
├── components/
│   ├── hq/                            # Current HackHQ UI (globe, deck, nav, …)
│   └── legacy/                        # README-driven browser, gallery, cards
├── lib/
│   ├── listings.ts                    # Reads listings.json, enriches for frontend
│   ├── parse-readme.ts                # Parses ../README.md (legacy /hackathons)
│   ├── types-hq.ts                    # Hackathon types and display helpers
│   └── types.ts                       # Legacy opportunity types
└── proxy.ts                           # Clerk middleware (when keys are configured)
```

## Getting started

> Requires **Node.js >= 20.9.0**.

Run from the `web/` directory so that `../.github/scripts/listings.json`,
`../README.md`, and `../assets/` resolve correctly.

```bash
cd web
cp .env.example .env.local   # then fill in values (see below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and set the values you need.

| Variable | Required | Used by | If missing |
| -------- | -------- | ------- | ---------- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | For globe | `components/hq/globe-map.tsx` | Globe shows a placeholder instead of the Mapbox map |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth | `app/layout.tsx`, `app/my/page.tsx`, `proxy.ts` | Site runs without Clerk; `/my` shows setup instructions |
| `CLERK_SECRET_KEY` | For auth | `app/my/page.tsx`, `proxy.ts` | Same as above — both Clerk keys are needed together |

Clerk is **optional**. When both Clerk keys are set, `ClerkProvider` wraps the
app and `/my` offers sign-in. Without them, the tracker still works locally;
nothing is persisted server-side.

> **Note:** The `/my` sign-in gate is currently enforced on the client only
> (`my-client.tsx`). There is no server-side route protection yet.

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

After changing `listings.json` or `README.md`, run a new build (or redeploy)
for production to pick up the updates.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router)
- [React 19](https://react.dev)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) (globe)
- [Clerk](https://clerk.com/) (optional auth)
- TypeScript

## Notes

- To change what appears on `/`, `/deck`, `/globe`, and `/my`, edit
  `.github/scripts/listings.json` (or the generator scripts under
  `.github/scripts/`).
- The legacy `/hackathons` page reads from the root `README.md` instead.
- `next.config.ts` allows optimized `raw.githubusercontent.com` images and the
  inline SVG banner.
