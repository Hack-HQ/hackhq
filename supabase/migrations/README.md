# Supabase migrations

The `hackathons` table backs the deck redesign. This directory is the
version-controlled record of every change made to it.

## How these are applied

**Not with the Supabase CLI, and not through an MCP tool.** Neither is
configured in this repo — no `supabase/config.toml`, no `supabase` dependency, no
CLI call in any workflow — so `supabase db push` and `supabase db dump` are not
steps anyone here can take. Migrations are applied **by hand through the
dashboard SQL Editor**, and the identical SQL is committed here so the repo and
the database agree. The procedure — what to snapshot first, how to wrap the apply
so a wrong end state rolls itself back, and how to verify afterwards — is
`docs/runbooks/apply-migration.md`. Read it before adding a file.

That mechanism records nothing, which is the source of every wrinkle below.
`supabase_migrations.schema_migrations` does hold versions for the early files,
from when they were applied through a recording path — the md5 query at the end
of this section still checks the committed SQL against those recorded statements.
A statement run in the SQL Editor adds no such row. So a filename's timestamp
prefix means one of two things, and the file's own header says which: for a
recorded file it **is** the version Supabase holds, and for a hand-applied file it
is a placeholder that only sorts correctly. `ls` here therefore returns more
entries than the recorded ledger does.

Name a new file `<YYYYMMDDHHMMSS>_<snake_case_summary>.sql` in UTC, and state in
its header whether it was hand-applied and when.

Recorded statements are immutable: `schema_migrations.statements` keeps whatever
was executed at the time, and no later edit to a file here reaches it — editing
these files rewrites the runnable artefact, never the history. Four committed
files have since diverged from what is recorded, and each carries a `NOTE` at the
top saying so and saying how. A fifth comment-only correction is listed for
symmetry even though it has nothing recorded to diverge *from*:

| file | how it differs |
| --- | --- |
| `20260722142728_revoke_rls_auto_enable_execute.sql` | executable SQL — bare `revoke` wrapped in an `if exists` guard |
| `20260722143346_revoke_rls_auto_enable_from_public.sql` | executable SQL — same guard, same reason |
| `20260722145817_rls_policies.sql` | executable SQL — gained four `drop policy if exists` lines |
| `20260722144205_add_deck_columns.sql` | comments only — a stale claim about enforcement, corrected |
| `20260725154500_user_hackathons.sql` | comments only — a claim about what enforced row ownership, corrected. Hand-applied, so nothing is recorded for it and the file is the only artefact; listed here so the correction is discoverable, not because the two disagree |

Three files were **applied by hand** through the SQL Editor rather than through a
recording path, so none appears in the ledger:

| file | state |
| --- | --- |
| `20260725154500_user_hackathons.sql` | applied via the Supabase SQL Editor on 2026-07-26; no ledger entry |
| `20260810064325_atomic_tracker_upsert.sql` | committed ahead of its apply — the file header (`:1-6`) carries the live status, so check there rather than this table. `web/lib/tracker-store.ts` calls `public.upsert_tracker_row`, so every `PUT /api/tracker` answers 503 `TRACKER_BACKEND_UNAVAILABLE` until the function exists |
| `20260818013000_force_tracker_owner_and_column_grants.sql` | not applied at time of writing — its own opening `NOTE` carries the live status, so check there rather than this table (no line range: that file is still being edited). Until it is applied, `user_hackathons` has no `public.force_tracker_owner` trigger and `authenticated` holds table-level INSERT/UPDATE, which is only invisible because service-role mode consults neither |

Hand-applied SQL records nothing in `supabase_migrations.schema_migrations`, so
those timestamps stay placeholders rather than recorded versions, the two lists do
not align, and `supabase db push` would try to replay all three if a CLI is ever
wired up. All three are guarded — `create table if not exists`, `drop policy if
exists`, `create or replace function`, `drop trigger if exists`, and `grant`/
`revoke`, which are idempotent — so a replay is survivable rather than
destructive, and survivable is not the same as correct. Reconcile before letting a
tool near production: insert the three versions into the ledger, or replay the
whole chain onto a fresh database. Adopting a CLI later does not retroactively
turn these timestamps into recorded versions.

The three SQL divergences all exist so the chain replays cleanly onto a fresh
database. That makes the files the runnable artefact and the recorded statements
the historical record; they are not interchangeable, and where they disagree the
file is the one to run. Every other file matches its recorded statement exactly
once comments are stripped — verifiable by hashing both:

```sql
select version, md5(btrim(regexp_replace(
         regexp_replace(array_to_string(statements, E'\n'), '--[^\n]*', '', 'g'),
         '\s+', ' ', 'g')))
from supabase_migrations.schema_migrations order by version;
```

## Why the schema looks the way it does

**`origin` is `text` + a `check`, not an enum.** Adding a value to a Postgres
enum needs `alter type`, which is awkward inside a migration and historically
could not run in a transaction. A check constraint is dropped and recreated in
one statement.

**`startDate` and `endDate` are camelCase** while everything else is snake_case.
They predate this work. `.github/scripts/seed_supabase.py` reads them under those
names, so renaming them is a breaking change for no benefit.

**`host` is `company_name` renamed**, done by `build_row` in that same script.

**`user_hackathons` has no foreign key to `hackathons`.** It is the per-user
tracker (stage + win flag) added for #226, keyed on the Clerk `sub` like
`submitted_by`. An FK would look obvious and be wrong: this table's `hackathon_id`
comes from `listings.json`, which the app renders from directly, while
`hackathons` trails it by up to an hour — so a user saving a listing added since
the last sync would hit a constraint violation for a listing that plainly exists
on screen. The id is checked against the live listing set in the app layer
instead.

**`user_hackathons.user_id` is not protected by its default.** The column carries
`default auth.jwt() ->> 'sub'`, and this README used to say that meant "the owner
cannot be spoofed even before the policies are consulted". It did not. A DEFAULT
is consulted only when the column is OMITTED, and `20260725154500` granted INSERT
and UPDATE at table level, which implies every column — so a caller naming
`user_id` explicitly reached no default at all, and the `with check` on the
"insert own tracker" and "update own tracker" policies was the only thing refusing
the write (verified under token mode: "new row violates row-level security policy
for table user_hackathons"). That made those two policies a single point of
failure. `20260818013000` adds the layer the old wording described:
`public.force_tracker_owner`, a BEFORE INSERT OR UPDATE trigger that fills
`user_id` when it is omitted and raises SQLSTATE 42501 on a mismatch instead of
quietly rewriting it — silent correction would hide the bug and, because RLS
`with check` sees the row as the trigger leaves it, would also swallow the policy
failure. The same migration replaces the table-level write grants with
column-level ones, so `user_id` is no longer UPDATE-grantable at all and an
existing row cannot be re-owned even by a caller whose own claim would satisfy the
policy — the same technique as withholding `submitted_by` and `featured` on
`hackathons`. Scope it honestly: the trigger reads the request's JWT, and
`service_role` and `postgres` carry none, so for them it is a no-op. In
service-role mode — how the app runs today — the cross-tenant boundary is still
the four `.eq("user_id", ...)` filters in `web/lib/tracker-store.ts` (#235).

## The two write paths

`listings.json` reaches this table through `.github/workflows/sync_supabase.yml`,
which runs `seed_supabase.py` on an hourly cron. Rows it writes carry
`origin = 'listings_json'`. Users submitting through the site will write
`origin = 'user'`.

The workflow also declares an `on: push` trigger for `listings.json`, but that
fires for human commits only — the bots that edit the file push with the default
`GITHUB_TOKEN`, and GitHub starts no workflow run for those. Assume the cron is
the sync, and that the table can trail `listings.json` by up to an hour.

The rule is that the sync never re-owns a user's row. That is enforced by the
`hackathons_skip_sync_over_user_rows` trigger, **not** by a policy —
`service_role` bypasses RLS, so a policy could not constrain the sync. Triggers
are not bypassed by any role.

The trigger returns `NULL` rather than raising, because `seed_supabase.py`
upserts in chunks of 100 and an exception would fail a whole chunk instead of
skipping one row.

`synced_at` is sent by `build_row` on every write, one stamp per run, so it means
"when the sync last wrote this row". It is not a database default doing the work —
the upsert merges the payload, so a column the payload omits is simply never
updated.

## Curation

`featured` is set by maintainers only: it is absent from the column grants in
`20260722163257`, so `authenticated` cannot write it at all.

It is also invalidated. `hackathons_clear_featured_on_content_swap`
(`20260722190603`) clears `featured` when a non-service writer changes `title`,
`url`, `host`, `description` or `logo_url`, because otherwise a submitter could
earn curation on one listing and then repoint the row at something else. Detail
edits — deadline, prize, dates, locations, format — deliberately do not cost the
curation.

"Non-service writer" is decided by `current_user`, not by the JWT: the sync
arrives as `service_role` and a maintainer in the dashboard as `postgres`, and
neither carries a JWT. The trusted roles are an allowlist, so a write path added
later clears `featured` until someone decides otherwise.

## What this directory does not create

The chain assumes a Supabase-shaped database. `20260722190741` grants the
privileges the earlier migrations only ever revoked — before it, `authenticated`
held `SELECT` and `DELETE` purely by Supabase's stock `grant all` bootstrap, so a
replay elsewhere produced a table the app could not read. That migration's
closing comment lists what is still inherited rather than created here: the API
roles, `auth.jwt()`, `gen_random_uuid()`, the `ALTER DEFAULT PRIVILEGES` that
grants `EXECUTE` on new functions, and `rls_auto_enable()`.

## Checking the current state

```sql
-- rows, and which path produced them
select origin, count(*) from public.hackathons group by origin;

-- triggers: expect both, and both BEFORE UPDATE
select tgname from pg_trigger
where tgrelid = 'public.hackathons'::regclass and not tgisinternal order by tgname;

-- policies: expect 4, and the read policy must list anon AND authenticated
select polname, polcmd, array(select rolname from pg_roles where oid = any(polroles))
from pg_policy where polrelid = 'public.hackathons'::regclass order by polname;

-- what anon can actually see (set role, not set local role - the latter is a
-- silent no-op outside a transaction and would prove nothing)
set role anon;
select count(*) from public.hackathons;
reset role;
```

Check the dashboard **Advisors** page — both Security and Performance — after any
DDL change (the MCP `get_advisors` equivalent is not available here, see above).
The performance linter is the one that catches an unwrapped `auth.jwt()` in a
policy, which re-evaluates per row.
