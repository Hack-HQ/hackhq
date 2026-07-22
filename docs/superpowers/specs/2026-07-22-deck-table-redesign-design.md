# Deck table redesign + Supabase migration — design

**Date:** 2026-07-22
**Status:** Approved, not yet planned
**Supersedes:** the card-based `/deck` UI (`web/components/hq/deck.tsx`)

## Goal

Replace `/deck`'s folder-style hackathon cards with a dense table — logo, title,
tag pills, poster avatar, age, bookmark — and add an "Add Opportunity" flow where
a signed-in user pastes a URL, an LLM extracts what it can, the user fills the
rest, and the result appears on the board.

Reference: the "Opportunities" board screenshots supplied 2026-07-22.

## Decisions

| Question | Decision |
|----------|----------|
| Storage | Full migration — Supabase becomes what the site reads |
| Migration style | Strangler: `listings.json` keeps feeding Supabase; automation untouched |
| Who can add | Signed-in users only (Clerk) |
| Moderation | None — submissions publish immediately; rate limiting is the only gate |
| Logos | Favicon derived from the listing URL, monogram tile on failure |
| Palette | HackHQ dark brand (ink / coral / paper), not the mockup's light theme |

## Architecture

```
GitHub automation ──writes──▶ listings.json ──seed_supabase.py──┐
(auto_extract, deadline_watcher,                                 ├──▶ Supabase ──reads──▶ Next.js
 update_readmes — unchanged)                                     │    hackathons
                                                                 │
Add Opportunity modal ──writes (Clerk-authed)────────────────────┘
```

`loadHackathons()` keeps its current signature and becomes an interface with two
implementations:

- **Supabase** when `SUPABASE_URL` is set — the production path.
- **`listings.json`** otherwise — keeps local dev, CI, and the geo-coverage tests
  working with no Supabase account. This fallback is load-bearing, not a
  convenience: `web-ci.yml` has no database credentials.

### Conflict rule

An `origin` column (`'listings_json' | 'user'`) governs the dual-source period.
`seed_supabase.py` upserts **only** rows where `origin = 'listings_json'`, so a
user-submitted row is never clobbered by the next automation run. There is no
merge logic beyond this.

## Current state of the database

Verified against project `gvdhwygerbsuojwpnsgq` (org `atvjoxcqenrldzrzodsu`) on
2026-07-22. More exists than the plan assumed, and some of it is broken.

| Item | State |
|------|-------|
| `hackathons` table | Exists, RLS enabled, 32 rows |
| Base columns | Match `build_row` exactly |
| `startDate` / `endDate` | **Already present** — #147's schema half is done. Note camelCase, not snake_case |
| `lat` / `lng` / `geo_status` | Present, but **0 of 32 rows geocoded** |
| Row count | **32, against 79 in `listings.json`** — last sync 2026-07-14, data as of 2026-07-04 |
| Migration history | **Empty** — schema was applied by hand |

Consequences for this design:

- **The sync is the gating item.** Supabase cannot become authoritative while it
  holds 32 of 79 listings; the board would silently lose more than half its
  content. Getting `seed_supabase.py` running on a schedule is a prerequisite for
  phase 2, not a nice-to-have.
- **Migrations start here.** Every schema change below ships as a migration, and
  the existing hand-made schema is captured as a baseline migration first, so the
  table stops being untracked.
- `start_date`/`end_date` in the table below are **already built** as
  `startDate`/`endDate`. Keep the existing camelCase rather than renaming; a
  rename would break `seed_supabase.py` for no benefit.

### RLS as it stands

One policy exists: `public read` — `SELECT` for `anon` where `is_visible = true`.
Two gaps follow from that, and both block this design:

1. **No policy covers the `authenticated` role.** Once Clerk sign-in is wired,
   signed-in users would receive an empty board while logged-out visitors see
   everything. The read policy must cover both roles.
2. **No `INSERT`/`UPDATE`/`DELETE` policies exist.** Only `service_role` can
   write, so the Add Opportunity flow cannot work until they are added.

Separately, `public.rls_auto_enable()` — an event trigger that auto-enables RLS
on new `public` tables — is `SECURITY DEFINER` and executable by `anon` and
`authenticated`. Practical risk is low, since event-trigger functions error when
invoked directly over RPC, but `EXECUTE` should be revoked from both roles.

## Schema

`seed_supabase.py::build_row` already defines the base mapping and is the
starting point — `id, host, title, url, locations, format, prize, state, active,
is_visible, date_posted, date_updated, source, deadline, featured`. Note `host`
is `company_name` renamed.

Columns this design adds:

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `origin` | text + check `listings_json \| user` | no | The conflict rule above |
| `description` | text | yes | Collected by the modal; no listing has one today |
| `logo_url` | text | yes | Override when the derived favicon is poor |
| `host_type` | text + check `university \| community \| company` | yes | Drives the university/community tag |
| `submitted_by` | text | yes | Clerk user id; drives the Posted By avatar |

`origin` and `host_type` are constrained sets, not Postgres enums. Adding a value
to an enum needs `alter type`, which is awkward inside a migration, so both ship
as `text` with a `check` constraint — `hackathons_origin_check` and
`hackathons_host_type_check`, as applied in
`supabase/migrations/20260722144205_add_deck_columns.sql`. `origin` also carries
a `not null` and a default of `'listings_json'`.

`startDate`/`endDate` already exist in the table, so #147 needs no schema work —
only population, which no row has yet.

User submissions are written with `is_visible = true` and `active = true` — the
board publishes them immediately, per the moderation decision above. `is_visible`
is retained as the lever a maintainer flips to retract a row after the fact, and
is the column any future moderation queue would use.

### RLS

- `select`: public. The board is public.
- `insert`: authenticated only, and `submitted_by` must equal the caller's Clerk
  subject. Enforced in policy, not application code.
- `update`/`delete`: only where `submitted_by` equals the caller — a user may fix
  or remove their own submission. Rows with `origin = 'listings_json'` are
  service-role only.

Clerk is the identity provider, so Clerk-issued JWTs must be accepted by
Supabase (third-party auth integration). Wiring that is part of phase 1.

## Tag vocabulary

Reuses the globe's vocabulary. `STATE_META` in `lib/types-hq.ts` already defines
the status colours; the table imports them rather than redefining.

| Group | Values | Source |
|-------|--------|--------|
| Status | `OPEN` #17b26a · `OPENS SOON` #f5a623 · `CLOSING SOON` #ed5b29 · `CLOSED` #6b6560 | `state` |
| Format | In-Person · Virtual · Hybrid | `format` |
| Host type | University · Community · Company | `host_type` |
| Location | one chip per entry | `locations` |

Rows show at most three pills, then `+N more…`, matching the mockup.

## Table UI

`/deck` renders columns: **Company** (logo + name) · **Title** · **Tags** ·
**Posted By** · **age** · **bookmark**. Above it, a filter bar:
`Bookmarked · Tags ▾ · Company ▾ · Date Posted ▾`, with the Add button aligned
right. Styling follows the existing dark brand — `shell`, `glass-dark`, `kicker`
and the ink/coral/paper tokens already in `globals.css`.

**Logos.** Derived from the `url` domain via a favicon service, falling back to a
monogram tile (first letter, brand palette) when the request fails or returns a
default globe. Requires a `remotePatterns` entry in `next.config.ts` and a CSP
allowance. `logo_url` overrides the derivation when set.

**Posted By.** For `origin = 'user'`, the Clerk avatar for `submitted_by`. For the
existing 79 rows, `source` is a GitHub username, so `github.com/<user>.png`
resolves for 63 of them; the 16 whose source is `devpost` get a neutral tile.

**Bookmark.** Reuses the tracker's existing `interested` stage in
`components/hq/store.tsx`, so a bookmark here appears in `/my` with no new state.

**Age.** Relative, from `date_posted`.

Mobile: the table collapses to stacked rows — logo, title, and tags remain; Posted
By and age move under the title.

## Add Opportunity flow

1. Modal, step 1 — a single `Link *` field. Copy states extraction may take up to
   15 seconds.
2. `POST /api/opportunities/extract` fetches and extracts server-side.
3. Modal, step 2 — the prefilled form: Company, Title, Description (500-char
   counter), Tags, Expiration Date. Fields the extractor could not determine are
   blank and required.
4. Save writes to Supabase and the row appears on the board immediately.

### Extraction route

Ports the logic in `.github/scripts/auto_extract.py` rather than reimplementing
it. Two properties of that script are requirements, not options:

**SSRF protection.** The endpoint fetches a user-supplied URL, which is a
textbook SSRF vector. `auto_extract.py` already hardens against it — including
DNS-rebind, per the `fix/issue-74-ssrf-dns-rebind` work — and that hardening must
be carried over: resolve the host, reject private and link-local ranges, re-check
after redirects, and never fetch from the browser.

**Rate limiting.** Because submissions publish immediately, this endpoint is the
only thing between a free Clerk account and the live board, and each call spends
money on `gpt-4o-mini`. Per-user server-side limit, enforced in the route.

`OPENAI_API_KEY` moves from a repo secret to a runtime environment variable. It
is server-only and must never be exposed via `NEXT_PUBLIC_`.

### Failure modes

| Case | Behaviour |
|------|-----------|
| Extraction exceeds 15s | Fall through to the blank form with a note; never block |
| URL unreachable or non-HTML | Inline field error; user may continue manually |
| URL already in the table | Warn and link the existing row before allowing a duplicate |
| Rate limit hit | Explain the limit and when it resets |
| Supabase write fails | Keep the form populated; do not discard input |

## Testing

Following the existing `lib/*.test.ts` convention — pure functions, no DOM:

- Tag derivation from `state`, `format`, `host_type`, `locations`
- Favicon URL derivation and the monogram fallback trigger
- Relative-age formatting
- The `origin` conflict rule
- SSRF guard: private, link-local, and post-redirect rebind cases must all reject

RLS policies get their own tests against a branch database.

`geo-coverage.test.ts` gates CI on listings whose locations cannot be placed on
the globe. It reads `listings.json` directly, so it is unaffected by the
migration and stays as-is — it continues to guard the automation's write path.

The gap that creates: a hackathon submitted through the modal never passes
through that gate, because it never enters `listings.json`. The extraction route
must therefore run the same geocode check before writing, and reject or flag an
unplaceable location at submit time. Without this, user submissions can silently
fail to appear on the globe — the exact failure #111 was filed to prevent.

## Delivery order

| Phase | Scope | User-visible |
|-------|-------|--------------|
| 0 | Baseline migration capturing the existing schema; revoke `EXECUTE` on `rls_auto_enable` | no |
| 1 | Restore the sync so all 79 listings reach Supabase, on a schedule | no |
| 2 | New columns; RLS read policy extended to `authenticated`; write policies; Clerk JWT wiring | no |
| 3 | `HackathonSource` interface + `listings.json` fallback, and the `web/README.md` rewrite that must land with it | no |
| 4 | **Table UI on `/deck`** | **yes** |
| 5 | Add Opportunity modal + extraction route | yes |
| 6 | Retire `deck.tsx` and the card UI | yes |

Phase 0 exists because the schema is currently untracked — capture it before
changing it. Phase 1 is the gating item: until the row count matches, switching
reads to Supabase silently drops more than half the board.

Phases 0–3 are invisible plumbing; the table lands at phase 4. Each phase is
independently shippable and leaves the site working.

## Risks

- **Two sources of truth** exist between phases 1 and 5. The `origin` rule keeps
  them from fighting, but a listing edited in both places will diverge silently.
- **Publishing without moderation** was chosen deliberately. Rate limiting is the
  only control; expect to need retroactive moderation tooling if the board is
  abused.
- **Cost.** Every extraction is a paid LLM call on a public endpoint.
- **Favicon quality** varies by host. `logo_url` is the escape hatch, and some
  rows will need it.
- **The sync has already gone stale once** — it last ran 2026-07-14 against data
  from 2026-07-04 and is 47 listings behind. Whatever restores it in phase 1 needs
  monitoring, or the board silently drifts from `listings.json` again.
- **Geocoding never ran.** All 32 rows have null `lat`/`lng`, so a Supabase-backed
  globe would render empty. `/globe` must not switch to the Supabase source until
  the geocoder has populated those columns.

## Out of scope

- Relighting the rest of the site to a light theme.
- Porting the GitHub automation off `listings.json` — it keeps writing JSON, and
  the sync carries it to Supabase.
- Bookmark sync across devices; bookmarks stay in the existing local tracker.
