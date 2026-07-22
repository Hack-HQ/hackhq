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

Applied statements are immutable. Where a committed file's comments have since
been corrected, the text recorded in `schema_migrations.statements` is the
original — `20260722144205_add_deck_columns.sql` carries a note saying so.

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
