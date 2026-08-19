# Threat model

What HackHQ trusts, what it does not, and where each boundary is actually
enforced. Written so that a reviewer can check a claim against a specific file
rather than take this document's word for it.

Scope: this repository and the site it deploys. Authentication (Clerk), the
database (Supabase) and hosting (Vercel) are third-party platforms — their
internals are out of scope, but the boundaries we draw against them are in.

## Trust boundaries

| # | Boundary | Untrusted side | Enforced at |
| --- | --- | --- | --- |
| 1 | Public site → server | Anything in a request | `web/app/api/tracker/route.ts` (the only route handler) |
| 2 | Server → browser | What we serialise into the page | `web/lib/listings.ts`'s field projection |
| 3 | One signed-in user → another | The caller's claimed identity | See [Tenant boundary](#tenant-boundary) |
| 4 | Contributor → repository | Issue text, form fields, attachments | See [Automation trust model](#automation-trust-model) |
| 5 | Repository → database | Whatever CI sends | `service_role` key, constrained by triggers rather than policies |

Two facts shape most of this:

- **There is exactly one route handler.** `web/app/api/tracker/route.ts`. No
  server actions exist anywhere in `web/`. So the entire request-handling attack
  surface of the application is four methods on one path.
- **There is no admin concept.** No roles, no permissions, no organisations, no
  `publicMetadata` reads. `web/middleware.ts` calls `auth.protect()` with no
  arguments — it is a signed-in-or-not check. Consequently there is no privilege
  escalation *within* the app: the most a hijacked session can do is what that
  user could already do.

## Data classification

`public.hackathons` is a public board. `public.user_hackathons` is per-user and
private. The interesting cases are the exceptions.

**Do not maintain a column list here.** It would drift from the code within a
release, and a stale security document is worse than none. The enforced
boundaries are:

- **What reaches a browser** is decided by the field projection in
  `web/lib/listings.ts` — an explicit object literal, deliberately not a spread.
  If a column is not named there, it does not reach the client. That literal *is*
  the boundary; read it rather than trusting a copy.
- **What the database will hand to an API role** is decided by the column-level
  `GRANT`s in `supabase/migrations/`, asserted on every pull request by
  `supabase/tests/10_invariants.sql`. If someone widens a grant, that suite fails
  and names the migration that established the invariant.

The two exceptions worth knowing:

- **`submitted_by` is private.** It is the submitter's Clerk user id. It is
  readable by neither `anon` nor `authenticated`, is grantable on INSERT but never
  on UPDATE (so a row cannot be re-owned), and is never emitted to the browser.
  Withholding it is the reason the read grants are a column list rather than a
  table grant.
- **`source` is public, and that is deliberate.** It is a GitHub username, already
  published in `.github/scripts/listings.json` and in the README's contributor
  wall. It reads like PII to strip; removing it would also empty the README and
  the archive, because it is a required field for the listing pipeline.

Gallery credits (a contributor's chosen name and profile link) are public by
agreement — the terms page commits to showing photos with the credit provided,
and the submission form offers "no attribution", which is honoured in the
committed filename, in `gallery.json`, in the issue-closing comment, and in the
commit's `Co-authored-by` trailer.

## Tenant boundary

One signed-in user must not reach another's tracker rows. **Where that is
enforced depends on which mode the deployment is running**, and the honest answer
today is: in application code.

### Current state — service-role mode

`web/lib/tracker-store.ts` authenticates to Supabase with the service role key,
which **bypasses row level security**. No policy on `public.user_hackathons` is
consulted. The boundary is four sites in that file: a `user_id` filter on the
read and on the delete, `p_user_id` on the upsert RPC, and a per-row `user_id`
stamp on the import. They are covered by tests that run the same suite twice,
once per mode.

That is a real boundary, and it is also a single layer. A regression in any of
those four lines is a cross-tenant leak with nothing behind it. This is tracked as
issue #235.

Two things narrow the blast radius, both in the database and neither dependent on
the application being correct:

- `public.force_tracker_owner`, a `BEFORE INSERT OR UPDATE` trigger, fills
  `user_id` from the request's JWT subject when it is omitted and **raises `42501`
  when a supplied value does not match**. It refuses rather than silently
  rewriting, so an attempt is loud and reaches Sentry. Note the scope: it keys on
  the JWT, and `service_role` carries none, so it is a deliberate no-op for the
  server-side client and for a maintainer in the SQL editor.
- `user_id` is not UPDATE-grantable at all, so an existing row cannot be re-owned
  even by a caller whose own claim would satisfy a policy.

The caller's identity itself is not attacker-controlled: the route derives it from
the verified Clerk session and never reads a user id from a request body, query
string, header or cookie.

### PENDING — token mode

**This section describes a state that is not live yet.** It becomes true when the
flip in [`docs/runbooks/flip-token-mode.md`](runbooks/flip-token-mode.md) lands,
which is gated on three pieces of external configuration, not on code. Do not
cite it as current until then, and update this section — not just the runbook —
when it does.

After the flip, each request carries the caller's Clerk JWT, queries run as
Supabase's `authenticated` role, and the RLS policies on
`public.user_hackathons` become the enforcement point: a cross-tenant read
returns zero rows because the database says so, not because the application
remembered to ask. The application-layer filters stay as a second layer, so a
misconfigured deployment degrades to today's guarantee rather than to nothing.

`SUPABASE_TRACKER_REQUIRE_RLS=1` makes a deployment that cannot run in token mode
refuse tracker traffic instead of falling back to the RLS-bypassing key. Every
tracker error reported to Sentry carries a `tracker_mode` tag, which is how the
live mode can be established after the fact.

## Privileged writes are a credential problem, not an authz problem

**No application code writes `public.hackathons`.** `web/lib/tracker-store.ts`
touches exactly one table, `user_hackathons`; there is no `from("hackathons")` and
no `.insert(` anywhere in `web/`.

The complete set of principals that can write the public board:

| Principal | Reach | Where the credential lives |
| --- | --- | --- |
| `service_role` | **Unrestricted**, bypasses RLS | The `SUPABASE_SERVICE_KEY` GitHub Actions secret used by the hourly sync, and `SUPABASE_SERVICE_ROLE_KEY` in a maintainer's local env |
| `postgres` / `supabase_admin` | Unrestricted | The Supabase dashboard — a human account |
| `authenticated` | Own `origin = 'user'` rows only | The publishable key plus a Clerk session; cannot set `featured`, `is_visible`, `state` or `id`, and cannot touch a synced row |

The consequence is worth stating plainly, because it redirects where to look after
an incident: **"someone modified listing data with elevated privileges" is a
credential-compromise or dashboard-access finding, not an application
authorisation bug.** There is no app path to it at any privilege level. The
mitigation is key rotation — see
[`docs/runbooks/rotate-credentials.md`](runbooks/rotate-credentials.md) — and MFA
on maintainer accounts.

The sync is constrained by a **trigger** rather than a policy, precisely because
`service_role` bypasses policies: `skip_sync_over_user_rows` discards any update
that would let the hourly sync take over a row a user submitted. Triggers are not
bypassed by any role.

## Automation trust model

Six workflows commit to `main` in response to community input. The model is:
**contributor input is untrusted data; the bot is the only identity that commits.**

- **Every committing workflow commits as `github-actions[bot]`.** No workflow
  derives a git identity from user input. A contributor who wants credit gets a
  `Co-authored-by:` trailer built from the authenticated actor's GitHub noreply
  address (`<numeric-id>+<login>@users.noreply.github.com`), which cannot be
  aimed at somebody else because both halves come from the event payload rather
  than from anything typed. A contributor-typed email field used to become the
  commit author; it was removed.
- **Untrusted text never reaches a shell.** Issue titles, bodies, comments and
  form fields cross into `run:` blocks through the `env:` map and are dereferenced
  as quoted shell variables. The only inline `${{ }}` uses inside `run:` blocks
  are `github.event_path` and `github.repository`, both runner-controlled.
- **`util.set_output` has no escaping of its own.** It is safe because every field
  reaching it is newline-stripped upstream by `sanitize_field`. Anything new that
  flows into `$GITHUB_OUTPUT` must keep that property, or it reopens an output
  injection path.
- **Label-gated, not open.** The issue-triggered workflows require a maintainer to
  apply a label, so an anonymous outsider cannot start them. The label is the
  control; there is no second one.
- **Third-party model processing is part of the pipeline.** The
  link-only submission path sends the submitted URL's content, and any free-text
  context, to the OpenAI API. Submitters should know that; the issue form is where
  to say so.
- **Attachments are re-encoded, not trusted.** Gallery images are decoded and
  re-saved through Pillow before they are committed, which drops camera metadata,
  and the pipeline refuses anything that will not decode. A CI check rejects any
  committed gallery image carrying GPS or Artist tags.
- **Actions are pinned to full commit SHAs** and every workflow declares an
  explicit `permissions:` block. No workflow uses `pull_request_target`, and none
  checks out untrusted pull-request code.

## Secrets

The rule is one line, in `web/README.md`: values prefixed `NEXT_PUBLIC_` are
inlined into the client bundle at build time; everything else is server-only and
must never gain that prefix. `web/lib/env.ts` reads the server-only values and
returns booleans, never the values themselves, so importing it cannot leak one.

Highest blast radius, in order: the Supabase `service_role` key (bypasses RLS on
both tables, so every policy in `supabase/migrations/` stops applying), a Postgres
connection string (`DATABASE_URL` — embeds the password and connects as the table
owner, so RLS never applies to it at all), and `CLERK_SECRET_KEY`. Rotation
procedures are in [`docs/runbooks/rotate-credentials.md`](runbooks/rotate-credentials.md).

Two layers keep them out of the repository: `.gitignore` and `web/.gitignore`
exclude every `.env` variant except the all-empty `.env.example`, and a
`.githooks/pre-commit` hook plus a CI job enforce the same rule on the tree and on
every commit an event introduces — the CI half is what makes `--no-verify`
harmless. `gitleaks` scans full history on every pull request.

## Known gaps

Recorded rather than hidden. Each is tracked.

| Gap | Status |
| --- | --- |
| Tenant boundary is application-layer, not database-enforced | Issue #235; the flip is prepared and gated on external configuration |
| No resource CSP (`default-src`/`script-src`); only `frame-ancestors` ships | Deliberate — needs per-integration allowances; `web/next.config.ts` records it |
| No rate limiting on `/api/tracker` | Bounded by `MAX_IMPORT_ENTRIES` on the import path only |
| Tracker rows accept any well-formed UUID, so a caller can store ids for listings that do not exist | Confined to the caller's own rows; the existence check exists in `web/lib/tracker.ts` but is not wired into the route |
| The Mapbox token is public by necessity and billable | Mitigation is a URL restriction on the Mapbox side, not in code |
| Authentication hardening lives in the Clerk dashboard, not here | Tracked in a private GitHub security advisory, not in this file — there is no in-repo auth surface to patch, and the detail does not belong in a public document |
| Token-mode flip blocked: Clerk is not registered as a Supabase third-party auth provider (verified 2026-08-18) | Issue #235; see [`docs/runbooks/flip-token-mode.md`](runbooks/flip-token-mode.md). Until it is, the tenant boundary stays application-layer |
