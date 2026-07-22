# Supabase migrations

The `hackathons` table backs the deck redesign. This directory is the
version-controlled record of every change made to it.

## How these are applied

**Not with the Supabase CLI.** There is no CLI configured in this repo.
Migrations are applied through the Supabase MCP `apply_migration` tool, and the
identical SQL is committed here so the repo and the database agree.

Each filename's timestamp prefix **is** the version Supabase recorded for it, so
`ls` here and `list_migrations` there return the same list in the same order.
That alignment is deliberate: `supabase db push` compares local filenames against
remote versions, and a mismatch would make it replay migrations that are already
applied. If you add one, name the file after the version `apply_migration`
reports back — not the time you started writing it.

Applied statements are immutable: `schema_migrations.statements` keeps whatever
was sent to `apply_migration`, and no later edit here reaches it. Four committed
files have since diverged from what is recorded, and each carries a `NOTE` at the
top saying so and saying how:

| file | how it differs |
| --- | --- |
| `20260722142728_revoke_rls_auto_enable_execute.sql` | executable SQL — bare `revoke` wrapped in an `if exists` guard |
| `20260722143346_revoke_rls_auto_enable_from_public.sql` | executable SQL — same guard, same reason |
| `20260722145817_rls_policies.sql` | executable SQL — gained four `drop policy if exists` lines |
| `20260722144205_add_deck_columns.sql` | comments only — a stale claim about enforcement, corrected |

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

## The two write paths

`listings.json` reaches this table through `.github/workflows/sync_supabase.yml`,
which runs `seed_supabase.py` hourly and on change. Rows it writes carry
`origin = 'listings_json'`. Users submitting through the site will write
`origin = 'user'`.

The rule is that the sync never re-owns a user's row. That is enforced by the
`hackathons_skip_sync_over_user_rows` trigger, **not** by a policy —
`service_role` bypasses RLS, so a policy could not constrain the sync. Triggers
are not bypassed by any role.

The trigger returns `NULL` rather than raising, because `seed_supabase.py`
upserts in chunks of 100 and an exception would fail a whole chunk instead of
skipping one row.

## Checking the current state

```sql
-- rows, and which path produced them
select origin, count(*) from public.hackathons group by origin;

-- policies: expect 4, and the read policy must list anon AND authenticated
select polname, polcmd, array(select rolname from pg_roles where oid = any(polroles))
from pg_policy where polrelid = 'public.hackathons'::regclass order by polname;

-- what anon can actually see (set role, not set local role - the latter is a
-- silent no-op outside a transaction and would prove nothing)
set role anon;
select count(*) from public.hackathons;
reset role;
```

Run `get_advisors` for both `security` and `performance` after any DDL change.
The performance linter is the one that catches an unwrapped `auth.jwt()` in a
policy, which re-evaluates per row.
