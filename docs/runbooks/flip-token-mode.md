# Runbook: flip tracker sync to token mode (#235)

Today a signed-in user's tracker rows are written with Supabase's **service role
key**, which bypasses row level security. Nothing in Postgres stops one account
touching another's row; what stops it is four filters in
`web/lib/tracker-store.ts` — `.eq("user_id", …)` on the read and the delete,
`p_user_id` on the RPC, and a per-row `user_id` stamp on the import. They are all
present and covered by tests that run twice, once per mode. They are also the
entire tenancy boundary, which is one bug away from a cross-account leak with no
second line of defence.

Token mode replaces that. Each request carries the caller's Clerk JWT, queries run
as Supabase's `authenticated` role, and the RLS policies on
`public.user_hackathons` become the guarantee. The application filters stay as
belt and braces, so a misconfigured deployment degrades to today's guarantee
rather than to nothing.

**The code is already written.** `tracker-store.ts` prefers `SUPABASE_ANON_KEY`
whenever it is set, mints the token via the Clerk template named `supabase`, and
refuses to fall back to the service role if Clerk returns nothing. There is no
code change in this runbook. What follows is verification, because the flip's
failure modes are all external.

## Why this is not just "set the env var"

Three things live outside this repo, and the flip is broken until all three are
true. A repository audit cannot confirm any of them.

| # | Artefact | Where to look | Failure if missing |
| --- | --- | --- | --- |
| 1 | Clerk registered as a third-party auth provider | Supabase dashboard → Authentication → Sign In / Up → Third Party Auth | Supabase rejects the JWT; every tracker request 500s |
| 2 | A Clerk JWT template named `supabase` carrying `{"role":"authenticated"}` | Clerk dashboard → Configure → JWT Templates | `getToken({ template: "supabase" })` returns null; the store throws by design rather than falling back |
| 3 | `SUPABASE_ANON_KEY` in the runtime environment | Vercel / Cloudflare project settings | Service mode stays selected and nothing changes |

`docs/superpowers/plans/2026-07-22-supabase-foundation.md` still records that
artefact 1 was **not** configured. Do not edit that line on the strength of an
assumption — correct it in the same change that demonstrates the flip, and
attach the evidence.

## Step 1 — land the database work first

Service mode masks every policy and grant on `user_hackathons`, so a mistake
there is invisible until the moment you flip, at which point it is an outage.
Apply these in order, via `docs/runbooks/apply-migration.md`:

1. `20260810064325_atomic_tracker_upsert.sql` — unapplied. Until it exists every
   `PUT /api/tracker` fails; the route now answers `503` with
   `TRACKER_BACKEND_UNAVAILABLE` instead of an opaque 500, so this is visible.
2. `20260818013000_force_tracker_owner_and_column_grants.sql` — the
   `force_tracker_owner` trigger and the column-level write grants.
3. `20260818014500_revoke_maintain_from_api_roles.sql` — the PG17+ `MAINTAIN`
   revoke.

Then run `supabase/tests/10_invariants.sql` against the live database from the
SQL Editor. It is the same file `.github/workflows/db-invariants.yml` runs on
every `supabase/**` pull request, and it is the only way to learn whether
production has drifted from its own migration chain.

## Step 2 — check the claim path matches the token

The single most common failure, and the one that looks exactly like "the feature
is broken": the policy reads one claim and the token carries another.

The policies compare `auth.jwt() ->> 'sub'` to `user_id`. Decode the token your
Clerk template actually issues and confirm:

- `sub` is present and is the same Clerk user id the app sends as `userId`;
- `role` is `authenticated`, or Supabase will not map the request to that role.

Do not decode a production token into a shared log or a chat window. Use Clerk's
template preview.

## Step 3 — prove isolation with real tokens, not mocks

On a preview deployment, or against a scratch database seeded from the chain:

1. Sign in as user A, save a hackathon, confirm it appears on `/my`.
2. Sign in as user B. Request A's row directly.
   **Assert zero rows, not an error.** An error means you are testing the wrong
   thing — usually a missing grant rather than a working policy.
3. `PUT /api/tracker` with a `user_id` in the body. It must be ignored: the route
   never reads one (`route.ts` destructures exactly `hackathonId`, `stage`,
   `isWin`), and the `force_tracker_owner` trigger raises `42501` if one ever
   reaches the database.
4. Confirm `submitted_by` on `public.hackathons` is still unreadable as
   `authenticated`.

## Step 4 — flip behind the switch, preview first

Set both in the preview environment:

```
SUPABASE_ANON_KEY=<publishable key>
SUPABASE_TRACKER_REQUIRE_RLS=1
```

`SUPABASE_TRACKER_REQUIRE_RLS` is the verification switch. With it set, a
deployment that cannot run in token mode **refuses to serve tracker traffic**
instead of quietly falling back to the RLS-bypassing key. So the preview either
works — which proves artefacts 1, 2 and 3 are all real — or it fails loudly.
There is no third outcome where it appears to work while enforcement is still in
application code.

Exercise the tracker: save, move a stage, mark a win, delete, and sign in on a
second device to trigger the one-time import.

Then repeat in production, in the same order: `SUPABASE_ANON_KEY` first, confirm
the tracker still works, then `SUPABASE_TRACKER_REQUIRE_RLS=1`.

## Rollback

**Unset `SUPABASE_TRACKER_REQUIRE_RLS`.** Service mode resumes on the next
request. If you also want to leave token mode, unset `SUPABASE_ANON_KEY` as well.

Both are environment-only. Neither needs a redeploy of code, which is the point:
the rollback path must not depend on a build succeeding at the moment you need it.

Keep `SUPABASE_SERVICE_ROLE_KEY` in place until token mode has been live long
enough to trust. It is ignored while the anon key is set — `tracker-store.ts`
prefers the anon key — so its presence costs nothing and its absence removes the
rollback.

## Step 5 — after the flip

- **Confirm the mode.** Every tracker error reported to Sentry now carries a
  `tracker_mode` tag (`token` / `service` / `off`), set in `route.ts`. That tag is
  how you answer "which mode is production in" later without reading the
  environment.
- **Make the privacy policy stronger.** `web/app/privacy/page.tsx` currently says
  every read and write is scoped to your account, and that the scoping is being
  moved into the database. Once token mode is verified, that becomes a database
  guarantee and the paragraph should say so. There is a comment in that file
  recording exactly this, and the page's own promise is that it changes when the
  code does.
- **Correct the plan.** Update the stale "Clerk third-party auth is not
  configured" line, with the evidence.
- **Then, and only then, consider removing `SUPABASE_SERVICE_ROLE_KEY`** from the
  runtime environment. `tracker-store.ts` is the only runtime code that reads it.
  Note it is a *different* variable from `SUPABASE_SERVICE_KEY`, the GitHub
  Actions secret the hourly sync uses — that one stays, and the sync keeps
  bypassing RLS by design, which is why the sync's protection is a trigger rather
  than a policy.

## What token mode does not fix

The hourly sync (`.github/scripts/seed_supabase.py`) runs as `service_role` and
will keep bypassing RLS. It writes `public.hackathons`, never
`public.user_hackathons`, and the `skip_sync_over_user_rows` trigger constrains it
because a policy could not. `force_tracker_owner` is keyed on the request JWT, so
it is a deliberate no-op for `service_role` and for a maintainer in the SQL
Editor. Nothing here changes that, and nothing here should.
