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

This app does **not query a database at runtime**. Listing data lives in the repo
and is read from disk when pages are generated. Supabase is maintained as a
Postgres mirror for backend/API work; its schema lives in `db/schema.ts` and is
managed with Drizzle.

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

### Supabase schema

`supabase/migrations/` is the **single source of truth** for this database. Those
files are what has actually been applied, and they carry the parts Drizzle cannot
represent at all: row level security, the column-level `GRANT`s that withhold
`submitted_by` from `anon` and `authenticated`, the two `BEFORE UPDATE` triggers,
and the `auth.jwt()` default on `user_hackathons.user_id`.

`db/schema.ts` is **types only — not a migration authority**. It is the shape the
app compiles against, annotated column by column with the migration that defines
it. Schema changes are written as SQL in `supabase/migrations/` and applied by
hand through the Supabase SQL Editor (this repo has no Supabase CLI and no MCP
configured). The procedure, including the snapshot to take first and the
self-aborting invariant to wrap the apply in, is
[`docs/runbooks/apply-migration.md`](../docs/runbooks/apply-migration.md).

Two Drizzle scripts remain, and both only *read* the live database. Each needs
`DATABASE_URL` (or `SUPABASE_DATABASE_URL`) set to the Supabase Postgres
connection string:

```bash
npm run db:pull    # introspect the live schema
npm run db:studio  # browse it
```

`db:push`, `db:generate` and `db:migrate` are gone on purpose. A migration
generated from `db/schema.ts` models no RLS, no grants and no triggers, so
applying one does not just miss the security model — it deletes it. Dropping
`origin` or `submitted_by` cascades all four policies on `public.hackathons`,
while `ENABLE ROW LEVEL SECURITY` survives, and a table with RLS on and no
policies is default deny: the site reads nothing and the hourly sync writes
nothing.

Two Drizzle artefacts are superseded and should not be trusted:

- `drizzle/0000_add_hackathon_event_dates.sql` — its `startDate`/`endDate`
  columns are already in the Supabase baseline at
  `../supabase/migrations/20260722141955_baseline_hackathons.sql:27-28`. There is
  nothing left for it to add, and it was never part of the applied chain.
- `drizzle/meta/0000_snapshot.json` — it describes only `public.hackathons`,
  records `"isRLSEnabled": false` with an empty `policies` map, and does not
  mention `user_hackathons` at all. It is the leftover state file of that one
  generated migration, not a description of the database.

`.github/scripts/test_schema_drift.py` fails CI when `db/schema.ts` and
`supabase/migrations/` stop agreeing, so the types cannot quietly rot away from
the SQL that defines them.

The Supabase mirror is still seeded by
[`../.github/scripts/seed_supabase.py`](../.github/scripts/seed_supabase.py) on
an hourly cron; see `../supabase/migrations/README.md` for the two write paths
and why the sync never re-owns a user's row.

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

Pages are prerendered, then **revalidated hourly** (ISR): every data-backed page
exports `revalidate = 3600`, so the server re-runs its loader in the background
at most once an hour.

Be precise about what that refreshes. `scripts/prepare-repo-data.mjs` copies the
repo-root files (`README.md`, `listings.json`, `geocodes.json`) into
`lib/generated/` at build time, and the loaders **import** them — so the data is
frozen into the deployment at build, and a revalidation re-runs the loader over
that *deployed* copy, not whatever is on `main` now. (No request-time filesystem
read remains, which is what keeps the app portable across hosts — see
[Deployment](#deployment).)

| Changes without a rebuild | Needs a new build + deploy |
| ------------------------- | -------------------------- |
| Deadline-derived state — "closing soon" flags, day counts, anything computed from the current date | The listings themselves — editing `listings.json`, `README.md`, or `geocodes.json` |

That is exactly what the hour is for (#47): those flags are derived from *today*,
so a page prerendered last week would otherwise keep serving last week's
countdown until someone redeployed.

| Route | Production render mode |
| ----- | ---------------------- |
| `/`, `/deck`, `/globe`, `/my`, `/hackathons` | Prerendered, ISR — `revalidate = 3600` |
| `/resources` | Prerendered, no revalidation — content is compiled-in constants, not repo data |
| `/auth/[[...auth]]` | Dynamic — rendered per request |

`next build` prints this: the ISR routes carry a `Revalidate` value of `1h`,
`/resources` carries none, and `/auth/[[...auth]]` is marked `ƒ (Dynamic)`.

**Development (`npm run dev`)** snapshots the data once, when `predev` runs
`scripts/prepare-repo-data.mjs`. Editing `listings.json` or `README.md` while the
dev server is running does **not** show up on refresh — regenerate the snapshot
with `npm run prepare-data` (or restart `npm run dev`). Editing a component still
hot-reloads as usual.

### Assets

Images referenced in the README (e.g. `assets/hackathons-banner.svg`) are
resolved by `resolveAssetSrc()` in `lib/parse-readme.ts`:

1. **Local first** — if the file is in the build-time asset manifest (i.e. it
   exists under `../assets/`), it's served as a static file from
   `public/repo-assets/`.
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
├── db/
│   └── schema.ts                      # Drizzle schema for the Supabase mirror
├── drizzle/
│   └── *.sql                          # Database migrations
├── lib/
│   ├── listings.ts                    # Reads listings.json, enriches for frontend
│   ├── nav.ts                         # Nav sections + active-route matching
│   ├── parse-readme.ts                # Parses ../README.md (legacy /hackathons)
│   ├── resources.ts                   # Field-guide stages, links, teaser tiles
│   ├── types-hq.ts                    # Hackathon types and display helpers
│   └── types.ts                       # Legacy opportunity types
├── drizzle.config.ts                  # Drizzle Kit config
├── open-next.config.ts                # OpenNext adapter — Cloudflare, see Deployment
├── wrangler.jsonc                     # Cloudflare Workers config (nodejs_compat)
└── middleware.ts                      # Clerk auth (Edge; see Deployment for why not proxy.ts)
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

### One-time: install the git hooks

Run once per clone, from anywhere in the repo:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` refuses to commit any `.env` / `.env.*` file except
`.env.example`. Without this config, git ignores the directory entirely. If the
hook does not fire, it needs the executable bit
(`chmod +x .githooks/pre-commit`).

It is a convenience, not the enforcement: `.github/workflows/secrets-guard.yml`
applies the same rule to the pushed commits, plus a gitleaks scan of the full
history, so `--no-verify` does not get a secret onto `main`. If something does
leak, follow
[`docs/runbooks/rotate-credentials.md`](../docs/runbooks/rotate-credentials.md) —
deleting the file in a later commit is not a fix.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and set the values you need.

| Variable | Required | Used by | If missing |
| -------- | -------- | ------- | ---------- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | For globe | `components/hq/globe-map.tsx` | Globe shows a placeholder instead of the Mapbox map |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth | `app/layout.tsx`, `app/my/page.tsx`, `middleware.ts` | Site runs without Clerk; `/my` shows setup instructions and `/auth/*` redirects to `/my` |
| `CLERK_SECRET_KEY` | For auth | `app/my/page.tsx`, `middleware.ts` | Same as above — both Clerk keys are needed together |
| `SUPABASE_URL` | For tracker sync | `lib/tracker-store.ts` | Tracker stays browser-local; `/api/tracker` reports `synced: false` |
| `SUPABASE_ANON_KEY` | For tracker sync (token mode) | `lib/tracker-store.ts` | Tracker sync falls back to service mode if the service role key is set, otherwise stays browser-local. See [Tracker sync modes](#tracker-sync-modes) |
| `SUPABASE_SERVICE_ROLE_KEY` | For tracker sync (service mode) | `lib/tracker-store.ts` | Fine once token mode is live; without either key the tracker stays browser-local. Clerk must be configured in every case or there is no user to attribute a row to |
| `SUPABASE_TRACKER_REQUIRE_RLS` | No | `lib/env.ts`, `lib/tracker-store.ts` | Set to `1` and tracker sync refuses service mode instead of falling back to the RLS-bypassing key. The flip's verification switch — see [`docs/runbooks/flip-token-mode.md`](../docs/runbooks/flip-token-mode.md) |
| `DATABASE_URL` | For DB scripts | `drizzle.config.ts` | `npm run db:*` commands fail fast before touching Supabase |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | `lib/analytics.ts` | Analytics is fully off — posthog-js is never downloaded |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `lib/analytics.ts` | Defaults to `https://us.i.posthog.com` |

The two keys are the only Clerk variables you need. The auth routes
(`/auth/sign-in`, `/auth/sign-up`) and the post-sign-in landing (`/my`) are
pinned in `middleware.ts` and `components/hq/auth-screen.tsx` rather than read from
`NEXT_PUBLIC_CLERK_*_URL` env vars — when those are unset, Clerk redirects to
its hosted account portal instead of the app's own screens.

Clerk is **optional**. When both keys are set, `ClerkProvider` wraps the app,
`/my` is protected in `middleware.ts` (signed-out visitors are redirected to
`/auth/sign-in`), and users can sign in with Google, GitHub, or email/password.
Without them, the tracker still works locally; nothing is persisted server-side.

To finish Clerk setup in the dashboard, enable Google and GitHub under social
connections, and enable email/password under email authentication.

### Tracker sync modes

`lib/tracker-store.ts` (behind `/api/tracker`) talks to Supabase in one of two
modes, chosen by which key is present:

- **Token mode** (preferred, `SUPABASE_ANON_KEY`): every request carries the
  signed-in caller's Clerk JWT, so queries run as Supabase's `authenticated`
  role and the RLS policies on `public.user_hackathons` (migration
  `20260725154500`) enforce row ownership **in Postgres**. The
  `upsert_tracker_row` RPC is `SECURITY INVOKER`, so it inherits the same
  policies. A missing Clerk token is a hard error, never a fallback to the
  service role.
- **Service mode** (legacy, `SUPABASE_SERVICE_ROLE_KEY` only): the service role
  bypasses RLS, so ownership is enforced **in app code** by the
  `.eq("user_id", ...)` filters and explicit `user_id` stamping in
  `lib/tracker-store.ts`. Those filters stay in token mode too, as a
  belt-and-braces layer under RLS.

Flipping a deployment to token mode takes three steps (issue
[#235](https://github.com/Hack-HQ/hackhq/issues/235)):

1. **Clerk dashboard**: create a JWT template named `supabase` whose claims
   include `{"role": "authenticated"}`.
2. **Supabase dashboard**: register Clerk as a third-party auth provider
   (Authentication -> Sign In / Up -> Third Party Auth), so Supabase accepts
   Clerk-issued JWTs.
3. **Runtime env**: set `SUPABASE_ANON_KEY` to the publishable key from
   Project Settings -> API. Token mode wins whenever it is set, so the service
   role key does not need to be removed for the flip itself.

Once token mode is verified in production, `SUPABASE_SERVICE_ROLE_KEY` can be
removed from the runtime environment entirely: `lib/tracker-store.ts` is the
only runtime code that reads it (the only other mentions in the repo are
`lib/env.ts` reporting and these docs), so nothing else breaks without it.

## Analytics

Product analytics (PostHog) is **optional and off by default**. To enable it,
set `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) and
rebuild — without the key, the posthog-js chunk is never downloaded and no
requests leave the browser.

The integration is deliberately cookieless and anonymous (`lib/analytics.ts`):

- **Collected:** SPA pageviews, plus two product events — `register_click`
  (outbound register/apply links in the deck and detail modal) and
  `globe_pin_click` (opening a pin's detail card on the globe). Events carry
  the listing id/title, nothing about the visitor.
- **Not collected:** no cookies or localStorage (in-memory persistence only),
  no autocapture, no session recording, no surveys, no user identification or
  person profiles. Visitors with Do Not Track or Global Privacy Control enabled
  are never tracked at all.

Because nothing is stored on the device and events are anonymous aggregate
stats, this configuration does not require a consent banner.

## Scripts

| Script                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Start the development server                         |
| `npm run build`        | Create a production build                            |
| `npm run start`        | Serve the production build                           |
| `npm run lint`         | Run ESLint                                           |
| `npm test`             | Run the Vitest suite (what CI runs)                  |
| `npm run copy-assets`  | Refresh `public/repo-assets/` from `../assets/`      |
| `npm run prepare-data` | Regenerate `lib/generated/` from the repo-root data  |
| `npm run preview`      | Cloudflare only — currently fails, see [Deployment](#deployment) |
| `npm run deploy`       | Cloudflare only — currently fails, see [Deployment](#deployment) |

`dev`, `build`, and `test` run `copy-assets` and/or `prepare-data` for you; you
only need them directly after changing something under `../assets/` or the
repo-root data files while a dev server is already running.

## Production build

```bash
npm run build
npm run start
```

After changing `listings.json` or `README.md`, run a new build and deploy — the
data is snapshotted into the deployment at build time, so hourly revalidation
alone will not pick up an edit. Revalidation keeps *date-derived* state fresh
between deploys; it does not fetch new content. See [Render model](#render-model).

## Deployment

Production target: **Vercel** (issue #223), deploying from `main` via the Vercel
Git integration. There is no deploy workflow in `.github/workflows/` — the
integration *is* the pipeline, and it is what makes the listing automation work:
`closing_soon`, `auto_extract`, `contribution_approved`, `update_readmes` and the
gallery workflows all push commits to `main`, and because listing data is frozen
into the bundle at build time (see [Render model](#render-model)), each of those
pushes only reaches users because it triggers a rebuild.

That coupling is the thing to protect. **Production must deploy from `main`.**
Pointing it at a long-lived branch silently strips the site of every automated
listing update, because those commits land on `main` and nowhere else.

### Environment variables in production

Set these in the Vercel project (Settings → Environment Variables). The
`NEXT_PUBLIC_*` values are inlined into the client bundle at build time; the rest
are server-only and must never gain a `NEXT_PUBLIC_` prefix.

| Variable | Scope | Notes |
| -------- | ----- | ----- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Build, public | Globe renders a placeholder without it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Build, public | Both Clerk values or neither |
| `CLERK_SECRET_KEY` | Runtime, secret | Both Clerk values or neither |
| `SUPABASE_URL` | Runtime, secret | URL plus at least one Supabase key, **and** Clerk configured |
| `SUPABASE_ANON_KEY` | Runtime, secret | Token mode: RLS enforces ownership in Postgres. See [Tracker sync modes](#tracker-sync-modes) |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime, secret | Service mode only; bypasses RLS ([#235](https://github.com/Hack-HQ/hackhq/issues/235)). Ignored when the anon key is set, removable once token mode is verified |
| `SUPABASE_TRACKER_REQUIRE_RLS` | Runtime, not a secret | `1` makes a deployment that cannot run in token mode refuse tracker traffic rather than degrade to app-layer enforcement. Off by default; setting it before the Clerk template and Supabase third-party auth exist takes the tracker down. Env-only rollback: unset it. [Runbook](../docs/runbooks/flip-token-mode.md) |
| `DATABASE_URL` (alias `SUPABASE_DATABASE_URL`) | Runtime, secret | Highest-risk value in the repo, and the one most often left out of a table like this. A Postgres connection string embeds the database password and connects as the table owner, so **RLS does not apply to it at all** — it reads and writes every row of `public.user_hackathons` regardless of policy. Only needed wherever `npm run db:*` runs, which is normally a laptop rather than the Vercel project; leave it unset here unless something actually needs it. Rotation: [`docs/runbooks/rotate-credentials.md`](../docs/runbooks/rotate-credentials.md) |

Every one is optional and degrades gracefully: without Mapbox the globe shows a
placeholder, without Clerk the tracker stays browser-local, without Supabase it
stays browser-local for signed-in users too. `validateEnv()` in `lib/env.ts`
warns on the half-configured cases rather than failing the build.

### Auth runs as Edge middleware (why `middleware.ts`)

Next 16 renamed Middleware to Proxy and runs `proxy.ts` on the Node.js runtime.
This app stays on the older `middleware.ts` convention on purpose, because
`opennextjs-cloudflare build` rejects Node middleware outright:

```
ERROR Node.js middleware is not currently supported. Consider switching to Edge Middleware.
```

Edge is what `middleware.ts` compiles to, and `clerkMiddleware` runs there
fine, so one file satisfies both hosts. Next prints a middleware→proxy
deprecation warning; that is expected and stays until OpenNext supports Node
proxy.

An earlier revision moved this to `proxy.ts` on the understanding that Clerk
pulled Node built-ins (`#crypto`, `#safe-node-apis`) that Edge rejects with
*"Edge Function is referencing unsupported modules"*. As of `@clerk/nextjs`
7.6.0 that no longer happens: `main` carries the file as Edge middleware and
**both** hosts build it green. If you hit that error again, pin the Clerk
version in the fix rather than renaming the file — the rename breaks Cloudflare.

**The middleware cannot simply be deleted** in favour of gating `/my` inside the
page. `auth()` requires `clerkMiddleware` to have run; without it every
server-side caller — including `/api/tracker`, which the synced tracker depends
on — fails with *"auth() was called but Clerk can't detect usage of
clerkMiddleware()"*.

### Both hosts build from `main`

`wrangler.jsonc`, `open-next.config.ts` and the `preview` / `deploy` /
`cf-typegen` scripts are all live, not vestigial. The runtime work from #230
stands — no request-time filesystem dependency — so the app builds and deploys
for Workers.

| | Vercel | Cloudflare Workers |
| --- | --- | --- |
| Trigger | Vercel Git integration | Workers Builds (Git integration) |
| Branch | `main` | `main` |
| Build | `next build` | `npx opennextjs-cloudflare build` |
| Root | `web` | `/web` |

Both watch `main`, so any commit that lands there — a PR merge or a listing
workflow's push — rebuilds both. Environment variables have to be set in **both**
dashboards; on Cloudflare the `NEXT_PUBLIC_*` pair are *build* variables
(Settings → Build → Variables and secrets) while the rest are runtime secrets
(Settings → Variables & Secrets), because build variables are not readable at
runtime.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router)
- [React 19](https://react.dev)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) (globe)
- [Clerk](https://clerk.com/) (optional auth)
- [Supabase](https://supabase.com/) (optional per-user tracker persistence)
- TypeScript

## Notes

- To change what appears on `/`, `/deck`, `/globe`, and `/my`, edit
  `.github/scripts/listings.json` (or the generator scripts under
  `.github/scripts/`).
- The legacy `/hackathons` page reads from the root `README.md` instead.
- `next.config.ts` allows optimized `raw.githubusercontent.com` images and the
  inline SVG banner.
