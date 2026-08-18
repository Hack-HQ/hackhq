# Runbook: apply a migration

Use this when a schema change has to reach the live Supabase database. Every
migration in `supabase/migrations/` since `20260725154500` has been applied by
hand through the dashboard SQL Editor, and that is the mechanism this project
has chosen and documented: there is no Supabase CLI and no MCP `apply_migration`
wired up here, so `supabase db push`, `supabase db dump`, `supabase migration up`
and branch databases are not steps you can take. Do not write a procedure that
assumes them.

**The committed file is the artefact; the SQL Editor is the only applicator.**
That inverts one habit worth naming up front: with a CLI you write SQL, push it,
and let the tool tell you what happened. Here nothing tells you. Nothing records
the version, nothing diffs the result, and a `grant` that silently changed
nothing still reports success. So the safety has to be written *into* the SQL —
snapshot first, wrap the apply in a transaction, and end it with an assertion
that aborts rather than a `select` you have to read.

## What is deliberately not available

| Not available | Why it matters here |
| ------------- | ------------------- |
| Supabase CLI (`db push`, `db dump`, `migration up`, `link`) | No `supabase/config.toml`, no `supabase` dependency, no CLI invocation in any workflow. There is no local ledger to compare against remote and no way to replay the chain from a terminal. |
| MCP `apply_migration` / `list_migrations` | Not configured. Hand-applied files therefore never land in `supabase_migrations.schema_migrations`, so `ls supabase/migrations/` returns more entries than the recorded ledger does. |
| A branch or shadow database | Nothing to rehearse against. The first execution of your SQL is the production one, which is the whole reason for the snapshot and the invariant below. |

`supabase/migrations/README.md` is the record of which files diverge from the
recorded statements and which were hand-applied. Read it before adding a file.

## Before you write the SQL

- **Commit the file first, then apply it.** The file is what future readers and
  `.github/scripts/test_schema_drift.py` compare against; a change applied and
  then written down is a change that gets written down wrong.
- **Name it `<YYYYMMDDHHMMSS>_<snake_case_summary>.sql`, UTC.** For files applied
  through a recorder the timestamp *is* the recorded version. For a hand-applied
  file it is only a placeholder that sorts correctly, and the file header must
  say so — copy the `NOTE` block at the top of
  `supabase/migrations/20260725154500_user_hackathons.sql:1-7`.
- **Make it idempotent wherever the syntax allows.** `create table if not exists`,
  `drop policy if exists` before `create policy`, `create or replace function`,
  `alter table ... add column if not exists`. Two reasons, and the second is the
  one that bites: a hand-applied file has no ledger entry, so nobody can tell by
  looking whether it ran, and someone will eventually run it twice.
- **One concern per file. Never mix a column change with a grant, policy or
  trigger change.** A failed `alter table` is loud; a privilege change that did
  nothing is silent. This chain has already been bitten four times — see
  `supabase/migrations/20260722192614_harden_trigger_fn_and_submitter_reads.sql:16-19`
  for the count — because a `revoke` targeted a holder that never held the
  privilege and reported success. Right now `service_role` bypasses RLS and
  column grants, so a broken grant changes nothing observable; the moment token
  mode is live (`web/README.md` → Tracker sync modes) that same broken grant is
  an outage or a leak. Splitting the files means the privilege change is applied
  and verified on its own, with its own invariant, and can be re-run alone.
- **Write a `-- rollback:` comment block, and check it against the snapshot.**
  Every file gets one, including the ones whose rollback is destructive and would
  never be run — in that case the block says so and says what would be lost. The
  block is not decoration: writing it is how you find out that your migration is
  not reversible, which is something to know before the apply and not during an
  incident.
- **Never edit an already-applied file to change what it does.** The recorded
  statements are immutable, and for hand-applied files there is not even a record
  to correct. A fix is a new file.

## Snapshot the current state

`supabase db dump` is not available, so the snapshot is a set of catalog queries
run in the SQL Editor. Capture them **before** the apply and paste the output
into the PR: it is the only "before" you will have, and it is what a rollback is
checked against. Narrow the table list to the tables the migration touches.

```sql
-- 1. Policies. pg_policies renders the predicates as text, which is what you
-- can actually diff afterwards; pg_policy stores them as parse trees.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('hackathons', 'user_hackathons')
order by tablename, policyname;

-- 2. RLS enablement. A policy list proves nothing on its own: with
-- relrowsecurity off the policies are inert, and with it on and the policies
-- dropped the table is default-deny.
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.hackathons'::regclass, 'public.user_hackathons'::regclass);

-- 3. Column-level grants. A table-level grant implies every column, so a bare
-- `grant select` and an explicit column list look identical everywhere except
-- here - this is the only view in which the withheld-column model exists at all.
-- Expect submitted_by to show up for service_role (it holds table-level SELECT,
-- and bypasses RLS regardless) and for neither API role: 20260722185202 revoked
-- anon's table-level SELECT and 20260722192614 revoked authenticated's, each
-- granting back a list that omits it.
select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('hackathons', 'user_hackathons')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_name, grantee, column_name, privilege_type;

-- 4. Triggers. tgisinternal excludes the ones Postgres creates for constraints.
-- Keep the full definition: the enforcement of "the sync never re-owns a user
-- row" is a trigger, not a policy, because service_role bypasses policies.
select c.relname as table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('hackathons', 'user_hackathons')
  and not t.tgisinternal
order by table_name, t.tgname;

-- 5. Functions. prosecdef is the SECURITY DEFINER flag and proconfig holds the
-- per-function search_path; both are security posture, not trivia. The role
-- array is who can call it, which is the part a bad revoke gets wrong.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef,
       p.proconfig,
       array(select r.rolname from pg_roles r
             where r.rolname in ('anon', 'authenticated', 'service_role')
               and has_function_privilege(r.oid, p.oid, 'execute')) as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, args;
```

## Apply it in one transaction that proves itself

Paste the migration into the SQL Editor wrapped like this. The trailing `do`
block is the point of the pattern: it raises instead of printing, so a migration
that applied cleanly but left the wrong end state rolls itself back rather than
waiting for someone to notice a row in the results pane.

```sql
begin;

-- the migration body, verbatim from the committed file

do $$
begin
  if not (<invariant>) then
    raise exception 'ABORT <version>: <what is now wrong, in the terms an operator cares about>';
  end if;
end $$;

commit;
```

Two mechanics worth knowing before you rely on it:

- **A raised exception aborts the transaction, and the trailing `commit` then
  behaves as a rollback.** That is Postgres, not the editor: once a statement
  errors inside an open transaction block, `commit` is downgraded to `rollback`.
  Nothing is left half-applied.
- **`WARNING: there is already a transaction in progress` is fine.** It means the
  editor had already opened a transaction around your statements. The
  all-or-nothing semantics you want still hold; the explicit `begin`/`commit` is
  there so the intent survives being copied somewhere that does not wrap.

One exception to the wrapper: statements that cannot run inside a transaction
(`create index concurrently`, `alter type ... add value` on older servers). Those
go in their own file, applied on their own, with the invariant run as a separate
`do` block afterwards.

### Worked example: the invariant that actually matters here

The single most consequential property of this schema is that `submitted_by` — a
submitter's Clerk user id — is **not readable** by the two API roles. It got that
way in two steps (`20260722185202` for `anon`, `20260722192614` for
`authenticated`), each of which revoked table-level `select` and granted back an
explicit list of the other 25 columns. Any future migration that adds a column
and re-grants table-level `select` for convenience silently undoes it. So assert
it:

```sql
begin;

-- the migration body

do $$
begin
  -- Direct grants, including the ones held via PUBLIC. If submitted_by shows up
  -- here for an API role, PostgREST will hand out submitter ids to anyone
  -- holding the publishable anon key.
  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema   = 'public'
      and table_name     = 'hackathons'
      and column_name    = 'submitted_by'
      and privilege_type = 'SELECT'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception
      'ABORT: submitted_by is SELECT-able by an API role - submitter Clerk ids are exposed through PostgREST';
  end if;

  -- Second, independent check. information_schema attributes a grant to its
  -- grantor and grantee, so a privilege reached through role *membership*
  -- (anon inheriting from some other role) does not appear above.
  -- has_column_privilege resolves the whole chain.
  if has_column_privilege('anon', 'public.hackathons', 'submitted_by', 'select')
     or has_column_privilege('authenticated', 'public.hackathons', 'submitted_by', 'select')
  then
    raise exception
      'ABORT: submitted_by is reachable via role membership even though no direct grant exists';
  end if;
end $$;

commit;
```

The same shape covers the other invariants this schema depends on: four policies
on `public.hackathons` with the read policy listing both `anon` and
`authenticated`, both `BEFORE UPDATE` triggers present, `relrowsecurity` true on
both tables. Assert the one your migration could plausibly break, not all of
them — an invariant nobody believes gets commented out.

## After applying

1. **Record what you ran, in the PR.** Paste the snapshot output, the SQL as
   executed, and the invariant's result. There is no ledger entry to point at
   later, so the PR *is* the audit trail.
2. **Note in the file header that it was hand-applied, and when.** Hand-applied
   files do not appear in `supabase_migrations.schema_migrations`, so
   the recorded ledger and `ls supabase/migrations/` disagree by exactly the count
   of files in this state. Add the file to the hand-applied table in
   `supabase/migrations/README.md`.
3. **Re-run the state checks in `supabase/migrations/README.md`** ("Checking the
   current state"): row counts by `origin`, the trigger list, the policy list
   with its role arrays, and the `set role anon` read probe. Those queries are
   maintained there; do not fork a second copy into this runbook.
4. **Run the dashboard advisors** for both `security` and `performance` after any
   DDL. The performance advisor is the one that catches an unwrapped
   `auth.jwt()` in a policy, which re-evaluates per row.
5. **Exercise the app path the migration was for.** A green invariant proves the
   database is in the intended state; it does not prove the feature works.

## Pending: `20260810064325_atomic_tracker_upsert.sql`

This file is committed and, at the time of writing, **not applied** — its header
(`:1-6`) is the live status, so check there rather than trusting this paragraph.
`web/lib/tracker-store.ts` calls `public.upsert_tracker_row`, so until the
function exists **every `PUT /api/tracker` fails** and the route answers `503`
with `code: "TRACKER_BACKEND_UNAVAILABLE"` (`web/lib/tracker-errors.ts`).

It is a single-concern file (one `create or replace function` plus the grants
that mirror `20260725154500`) and it is idempotent, so it can be pasted as-is.
Post-apply verification, in order:

```sql
-- SECURITY INVOKER, not DEFINER: expect prosecdef = false. A definer function
-- would quietly opt out of the very RLS enforcement #235 is trying to gain.
-- proconfig must contain search_path= (the file sets it to ''), which is what
-- stops a caller-controlled search_path from resolving public.user_hackathons
-- to something else.
select proname, prosecdef, proconfig
from pg_proc
where proname = 'upsert_tracker_row';

-- Who can call it: expect authenticated and service_role, and NOT anon or
-- PUBLIC. Postgres grants EXECUTE to PUBLIC on every new function, which is why
-- the file revokes from public before granting.
select r.rolname
from pg_roles r, pg_proc p
where p.proname = 'upsert_tracker_row'
  and has_function_privilege(r.oid, p.oid, 'execute')
  and r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
order by r.rolname;
```

Then a **real write**, which is the only thing that proves the route: sign in,
open `/my`, and move a tracked hackathon between stages. The `PUT /api/tracker`
in the network panel must return `200` with `{"synced":true,"entry":{...}}` —
not the `503`, and not a `200` carrying `{"synced":false}`, which means Clerk or
Supabase is unconfigured rather than that the write succeeded. Reload in a fresh
session and confirm the stage came back from Postgres. A raw `curl` is not a
shortcut here: `PUT` resolves the caller through Clerk, so without a session
cookie it answers `401` regardless of the function's state.

Finally, confirm the atomicity the file exists for: change stage and win flag
from two controls in quick succession and reload. Both survive. Before this
function, the read-modify-write in `upsertTrackerRow` lost whichever landed
first.

## If a CLI is ever wired up

Reconcile the ledger *before* the first `db push`. Two files have been applied by
hand and are absent from `supabase_migrations.schema_migrations`:
`20260725154500_user_hackathons.sql` and
`20260810064325_atomic_tracker_upsert.sql`. A CLI compares local filenames
against recorded versions, sees no version for either, and replays both.

Both are guarded — `create table if not exists`, `create or replace function`,
`drop policy if exists` — so a replay is survivable rather than destructive.
"Survivable" is not "correct": the right move is to insert the two versions into
the ledger (or replay the whole chain onto a fresh database, which is what the
executable-SQL divergences listed in `supabase/migrations/README.md` were written
for) and only then let a tool near production. Adopting a CLI does not
retroactively make these timestamps recorded versions.
