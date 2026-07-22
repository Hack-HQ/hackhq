# HackHQ Web

The web frontend for **HackHQ** — a browsable interface for the hackathon
listings maintained in this repository.

It's a [Next.js](https://nextjs.org) (App Router) app with a 3D globe, card
deck, and member tracker, plus a legacy searchable directory at `/hackathons`.

## What it does

- **Home (`/`)** — hero, stats, and entry points into the globe and deck.
- **Globe (`/globe`)** — 3D Mapbox map with status-colored markers.
- **Deck (`/deck`)** — flip through hackathons as tactile cards or a dense list.
- **My HackHQ (`/my`)** — protected personal tracker pipeline (optional Clerk sign-in).
- **Resources (`/resources`)** — a stage-by-stage field guide with curated links.
- **All hackathons (`/hackathons`)** — legacy README-driven search and filters.

## How it works

This app has **no database**. Listing data lives in the repo and is read from
disk when pages are generated.

### Data sources

| Route(s) | Loader | Source file |
| -------- | ------ | ----------- |
| `/`, `/deck`, `/globe`, `/my` | `loadHackathons()` in `lib/listings.ts` | `../.github/scripts/listings.json` |
| `/hackathons` | `loadSiteData()` in `lib/parse-readme.ts` | `../README.md` (table + stats banner) |
| `/resources` | none — imported directly | `lib/resources.ts` (stages, links, teaser copy) |

`listings.json` is the source of truth for the main HackHQ experience.
`parse-readme.ts` still powers the legacy `/hackathons` page, which parses the
README table between `<!-- HACKATHONS_TABLE_START -->` and
`<!-- HACKATHONS_TABLE_END -->`.

### Putting a listing on the globe

The globe can only render a listing it has coordinates for. The table lives in
[`.github/scripts/geocodes.json`](../.github/scripts/geocodes.json) and is read
by two things that must never disagree: `lib/geo.ts` (the site) and
`.github/scripts/check_geo_coverage.py` (the listing automation).

Lookups normalize first — case, whitespace, and a trailing country are all
ignored, so `Toronto, ON`, `Toronto, ON, Canada`, and `Toronto, Canada` all
resolve to one Toronto rather than needing three entries.

**A listing in a city we can't place is reported, never dropped in silence** (#111):

| Path | What happens |
| ---- | ------------ |
| Pull request | `lib/geo-coverage.test.ts` fails CI, naming the location |
| Automated add (issue → `approved`) | The workflow comments on the issue naming the location. It does **not** block the add — those jobs push to `main` with the default `GITHUB_TOKEN`, so no Web CI run is created for them |
| Either way | `loadHackathons()` warns, and the globe states how many listings it isn't showing |

To fix a report, add the location to `coordinates` in `geocodes.json` — or to
`unmappable` if it genuinely has no place on a map (e.g. `TBA`). Virtual
listings are excluded from the map on purpose and never trip the check.

### Render model

Pages are prerendered, then **revalidated hourly** (ISR). Both loaders use
`fs.readFileSync` at build time, so listing data and counts are baked into the
payload — but every data-backed page exports `revalidate = 3600`, so the server
re-runs the loader in the background at most once an hour and serves the fresh
result from then on. **A data change does not need a rebuild to appear**; it
needs a deploy of the changed file plus up to an hour.

That hour is deliberate: deadline-derived state ("closing soon", day counts)
depends on the current date, so a page built last week would otherwise keep
serving last week's countdown (#47).

| Route | Production render mode |
| ----- | ---------------------- |
| `/`, `/deck`, `/globe`, `/my`, `/hackathons` | Prerendered, ISR — `revalidate = 3600` |
| `/resources` | Prerendered, no revalidation — content is compiled-in constants, not repo data |
| `/auth/[[...auth]]` | Dynamic — rendered per request |

`next build` prints this: the ISR routes carry a `Revalidate` value of `1h`,
`/resources` carries none, and `/auth/[[...auth]]` is marked `ƒ (Dynamic)`.

**Development (`npm run dev`)** is more immediate: Next.js re-executes server
components when you refresh or when files change, so edits to `listings.json`
or `README.md` show up right away rather than on the next revalidation.

### Assets

Images referenced in the README (e.g. `assets/hackathons-banner.svg`) are
resolved by `resolveAssetSrc()` in `lib/parse-readme.ts`:

1. **Local first** — if the file exists under `../assets/`, it's served as a
   static file from `public/repo-assets/`.
2. **Remote fallback** — otherwise it falls back to the file on `main` via
   `raw.githubusercontent.com`.

`public/repo-assets/` is generated, not committed. `scripts/copy-repo-assets.mjs`
copies `../assets/` into it, and both `npm run dev` (via `predev`) and
`npm run build` run that script first — so the files are in place before Next.js
starts. Run it on its own with `npm run copy-assets`.

## Project structure

```text
web/
├── app/
│   ├── page.tsx                       # Home; loadHackathons() + HomeClient
│   ├── globe/page.tsx                 # 3D globe
│   ├── deck/page.tsx                  # Card deck
│   ├── my/page.tsx                    # Protected member tracker hub
│   ├── resources/page.tsx             # Hackathon field guide
│   ├── auth/[[...auth]]/page.tsx      # Clerk sign-in/sign-up
│   ├── hackathons/page.tsx            # Legacy README browser
│   └── layout.tsx                     # Root layout, fonts, optional ClerkProvider
├── components/
│   ├── hq/                            # Current HackHQ UI (globe, deck, nav, …)
│   │   ├── nav.tsx                    # Nav pill; inline links at md and up
│   │   ├── mobile-menu.tsx            # The same sections below 768px
│   │   ├── resources.tsx              # /resources page sections
│   │   ├── stage-jump-nav.tsx         # Sticky stage rail; publishes its clearance
│   │   └── resources-teaser.tsx       # Home-page 2×2 teaser + resource-tile-card
│   └── legacy/                        # README-driven browser, gallery, cards
├── lib/
│   ├── listings.ts                    # Reads listings.json, enriches for frontend
│   ├── nav.ts                         # Nav sections + active-route matching
│   ├── parse-readme.ts                # Parses ../README.md (legacy /hackathons)
│   ├── resources.ts                   # Field-guide stages, links, teaser tiles
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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth | `app/layout.tsx`, `app/my/page.tsx`, `proxy.ts` | Site runs without Clerk; `/my` shows setup instructions and `/auth/*` redirects to `/my` |
| `CLERK_SECRET_KEY` | For auth | `app/my/page.tsx`, `proxy.ts` | Same as above — both Clerk keys are needed together |

The two keys are the only Clerk variables you need. The auth routes
(`/auth/sign-in`, `/auth/sign-up`) and the post-sign-in landing (`/my`) are
pinned in `proxy.ts` and `components/hq/auth-screen.tsx` rather than read from
`NEXT_PUBLIC_CLERK_*_URL` env vars — when those are unset, Clerk redirects to
its hosted account portal instead of the app's own screens.

Clerk is **optional**. When both keys are set, `ClerkProvider` wraps the app,
`/my` is protected in `proxy.ts` (signed-out visitors are redirected to
`/auth/sign-in`), and users can sign in with Google, GitHub, or email/password.
Without them, the tracker still works locally; nothing is persisted server-side.

To finish Clerk setup in the dashboard, enable Google and GitHub under social
connections, and enable email/password under email authentication.

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
