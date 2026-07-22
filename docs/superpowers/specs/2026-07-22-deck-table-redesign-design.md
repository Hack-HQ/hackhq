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

## Schema

`seed_supabase.py::build_row` already defines the base mapping and is the
starting point — `id, host, title, url, locations, format, prize, state, active,
is_visible, date_posted, date_updated, source, deadline, featured`. Note `host`
is `company_name` renamed.

Columns this design adds:

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `origin` | enum `listings_json \| user` | no | The conflict rule above |
| `description` | text | yes | Collected by the modal; no listing has one today |
| `logo_url` | text | yes | Override when the derived favicon is poor |
| `host_type` | enum `university \| community \| company` | yes | Drives the university/community tag |
| `submitted_by` | text | yes | Clerk user id; drives the Posted By avatar |
| `start_date` | date | yes | Event start — closes #147 |
| `end_date` | date | yes | Event end — closes #147 |

`start_date`/`end_date` are included because #147 asks for them and the migration
is the cheapest moment to add them.

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
| 1 | Supabase project, schema, RLS, Clerk JWT wiring, sync | no |
| 2 | `HackathonSource` interface + `listings.json` fallback | no |
| 3 | **Table UI on `/deck`** | **yes** |
| 4 | Add Opportunity modal + extraction route | yes |
| 5 | Retire `deck.tsx` and the card UI | yes |

Phases 1–2 are plumbing; the table lands at phase 3. Each phase is independently
shippable and leaves the site working.

## Risks

- **Two sources of truth** exist between phases 1 and 5. The `origin` rule keeps
  them from fighting, but a listing edited in both places will diverge silently.
- **Publishing without moderation** was chosen deliberately. Rate limiting is the
  only control; expect to need retroactive moderation tooling if the board is
  abused.
- **Cost.** Every extraction is a paid LLM call on a public endpoint.
- **Favicon quality** varies by host. `logo_url` is the escape hatch, and some
  rows will need it.

## Out of scope

- Relighting the rest of the site to a light theme.
- Porting the GitHub automation off `listings.json` — it keeps writing JSON, and
  the sync carries it to Supabase.
- Bookmark sync across devices; bookmarks stay in the existing local tracker.
