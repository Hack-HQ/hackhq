# Supabase Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HackHQ Supabase project a trustworthy source of hackathon data — tracked schema, complete rows, and RLS policies that let the site read and signed-in users write.

**Architecture:** Strangler migration. `listings.json` stays the write target for all existing GitHub automation; a scheduled workflow syncs it into Supabase. Schema changes ship as migrations recorded in both Supabase's history and the repo. Nothing in the web app changes in this plan — it is pure groundwork.

**Tech Stack:** Postgres 17 (Supabase), Python 3 + `requests` (existing automation), GitHub Actions, `unittest`.

This is **plan 1 of 4** for `docs/superpowers/specs/2026-07-22-deck-table-redesign-design.md`:

| Plan | Spec phases | Deliverable |
|------|-------------|-------------|
| **1 — this plan** | 0–2 | Schema tracked, rows complete, RLS correct |
| 2 | 3–4 | `HackathonSource` interface + the `/deck` table UI |
| 3 | 5 | Add Opportunity modal + extraction route |
| 4 | 6 | Retire `deck.tsx` |

## Global Constraints

- Supabase project id: `gvdhwygerbsuojwpnsgq` (org `atvjoxcqenrldzrzodsu`). Verify with `list_projects` before any write — a previous session was connected to a different account.
- Table: `public.hackathons`, primary key `id` (uuid). 32 rows at time of writing; `listings.json` holds 79.
- `host` is `company_name` renamed. Do not rename it.
- `startDate` / `endDate` already exist and are **camelCase**. Do not rename them; `seed_supabase.py` would break.
- Python deps are pinned in `.github/scripts/requirements.txt` (issue #45). Do not add a dependency in this plan — `seed_supabase.py` uses `requests`, already pinned.
- Python tests are `unittest`, discovered by `python -m unittest discover -s .github/scripts -p 'test_*.py'`. Not pytest.
- New workflows must not stage `assets/hackathons-banner.svg` and must not use `git diff --quiet <path>` gating — `test_workflows.py` enforces both.
- Never print or log `SUPABASE_SERVICE_KEY`.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/*.sql` | **Create.** Version-controlled copy of every migration applied. New directory. |
| `.github/scripts/seed_supabase.py` | **Modify.** `build_row` gains `origin`. |
| `.github/scripts/test_scripts.py` | **Modify.** Tests for the above. |
| `.github/workflows/sync_supabase.yml` | **Create.** Scheduled + on-change sync. |

---

### Task 1: Track the existing schema before changing it

The table was created by hand and Supabase's migration history is empty. Capture it first, so later migrations apply to a known baseline.

**Files:**
- Create: `supabase/migrations/20260722000000_baseline_hackathons.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a `hackathons` table whose definition is version-controlled. Later tasks assume columns `id, host, title, url, locations, format, prize, state, active, is_visible, date_posted, date_updated, source, lat, lng, geo_status, synced_at, deadline, featured, "startDate", "endDate"`.

- [ ] **Step 1: Confirm you are on the right Supabase account**

Call `list_projects`. Expected: exactly one project named `HackHQ`, id `gvdhwygerbsuojwpnsgq`.
If you see `sapling` / `overvalued` instead, stop — the connector is on the wrong account.

- [ ] **Step 2: Confirm the migration history is still empty**

Call `list_migrations` with `project_id: gvdhwygerbsuojwpnsgq`.
Expected: `{"migrations":[]}`. If it is non-empty, someone has started this already — stop and re-read.

- [ ] **Step 3: Write the baseline migration file**

```sql
-- supabase/migrations/20260722000000_baseline_hackathons.sql
-- Captures the hand-created schema as it stood on 2026-07-22 so later
-- migrations have a known starting point. Idempotent: safe to re-run.

create table if not exists public.hackathons (
  id            uuid primary key,
  host          text not null,
  title         text not null,
  url           text not null,
  locations     text[] not null default '{}'::text[],
  format        text,
  prize         text,
  state         text,
  active        boolean default true,
  is_visible    boolean default true,
  date_posted   bigint,
  date_updated  bigint,
  source        text,
  lat           double precision,
  lng           double precision,
  geo_status    text,
  synced_at     timestamptz default now(),
  deadline      date,
  featured      boolean default false,
  "startDate"   date,
  "endDate"     date
);

alter table public.hackathons enable row level security;
```

- [ ] **Step 4: Apply it**

Use `apply_migration` with `project_id: gvdhwygerbsuojwpnsgq`, `name: baseline_hackathons`, and the SQL above.

- [ ] **Step 5: Verify it recorded and changed nothing**

Call `list_migrations`. Expected: one entry named `baseline_hackathons`.

Then `execute_sql`:

```sql
select count(*) as rows from public.hackathons;
```

Expected: `32`. The migration is `create table if not exists` — if this returns 0, you have created a new empty table and must investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260722000000_baseline_hackathons.sql
git commit -m "feat(db): capture the hand-created hackathons schema as a baseline migration"
```

---

### Task 2: Close the SECURITY DEFINER hole

`public.rls_auto_enable()` is an event trigger that auto-enables RLS on new `public` tables — worth keeping. But it is `SECURITY DEFINER` and `EXECUTE` is granted to `anon` and `authenticated`, which Supabase's linter flags.

**Files:**
- Create: `supabase/migrations/20260722000100_revoke_rls_auto_enable_execute.sql` — the no-op, committed because it is already in the database's history
- Create: `supabase/migrations/20260722000110_revoke_rls_auto_enable_from_public.sql` — the actual fix

**Interfaces:**
- Consumes: Task 1's baseline.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Confirm the advisory is present**

Call `get_advisors` with `type: security`. Expected: two WARN lints naming `rls_auto_enable`.

- [ ] **Step 2: Confirm who actually holds the grant**

```sql
select proacl::text as acl,
       has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') as anon_can
from pg_proc
where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace;
```

Expected: `acl` contains an `=X/postgres` entry — an empty grantee, which means
`PUBLIC`. `anon_can` is `true`.

This is why the obvious fix does not work. Postgres grants `EXECUTE` on a new
function to `PUBLIC` by default, and `anon`/`authenticated` inherit from it
rather than holding a grant of their own. `revoke ... from anon, authenticated`
therefore revokes a grant that was never made and silently changes nothing —
verified against this database on 2026-07-22.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260722000110_revoke_rls_auto_enable_from_public.sql
-- rls_auto_enable() is an event trigger. Event-trigger functions are invoked by
-- the system, not by a caller's EXECUTE privilege, so nothing needs this grant.
--
-- Revoke from PUBLIC, not from anon/authenticated: those roles hold no grant of
-- their own, they inherit PUBLIC's. Revoking from them is a no-op — an earlier
-- migration (20260722142728) tried exactly that and changed nothing.
--
-- service_role keeps its explicit grant, so server-side callers are unaffected,
-- and the function's owner (postgres) retains rights implicitly.

revoke execute on function public.rls_auto_enable() from public;
```

Note the version prefix supersedes the earlier no-op rather than replacing it.
The no-op is already recorded in the database's migration history and cannot be
rewritten, so its file is committed alongside this one to keep the repo and the
database's history in step.

- [ ] **Step 4: Apply it**

`apply_migration`, `name: revoke_rls_auto_enable_from_public`.

- [ ] **Step 5: Verify the grant is actually gone**

```sql
select proacl::text as acl,
       has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') as anon_can,
       has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') as auth_can,
       has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE') as service_can
from pg_proc
where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace;
```

Expected: `anon_can` and `auth_can` are now `false`; `service_can` stays `true`.
If `service_can` flipped to false, the revoke was too wide — stop and report.

- [ ] **Step 6: Verify the advisory clears**

Call `get_advisors` with `type: security`.
Expected: the two `rls_auto_enable` lints are gone.

- [ ] **Step 7: Verify the trigger still fires**

The revoke must not break the safety net. Run each statement, then confirm the
probe table is gone.

```sql
create table public.rls_probe (id int);
select relrowsecurity from pg_class where oid = 'public.rls_probe'::regclass;
drop table public.rls_probe;
select to_regclass('public.rls_probe') as should_be_null;
```

Expected: `relrowsecurity` is `true`, and `should_be_null` is `null`. If the
probe table survives, drop it before finishing — leaving it behind pollutes the
schema.

- [ ] **Step 8: Commit both files**

The no-op is already in the database's migration history, so its file is
committed too — the repo must mirror what was applied, not what we wish had been.

```bash
git add supabase/migrations/20260722000100_revoke_rls_auto_enable_execute.sql \
        supabase/migrations/20260722000110_revoke_rls_auto_enable_from_public.sql
git commit -m "fix(db): revoke rls_auto_enable EXECUTE from PUBLIC, not from anon

anon and authenticated hold no grant of their own on this function - they
inherit PUBLIC's, which Postgres grants by default at creation. Revoking from
them changed nothing, and the security lint stayed put.

The no-op migration is committed alongside the fix because it is already
recorded in the database's migration history and cannot be rewritten."
```

---

### Task 3: Add the columns the redesign needs

**Files:**
- Create: `supabase/migrations/20260722000200_add_deck_columns.sql`

**Interfaces:**
- Consumes: Task 1's baseline.
- Produces: columns `origin` (text, not null, `'listings_json' | 'user'`), `description` (text), `logo_url` (text), `host_type` (text, `'university' | 'community' | 'company'`), `submitted_by` (text). Task 4 writes `origin`; Task 5's policies read `submitted_by`.

Uses `text` + `check` rather than Postgres enums: adding a value to an enum requires `alter type`, which is awkward inside a migration and cannot run in a transaction on older versions.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260722000200_add_deck_columns.sql
-- Columns for the deck redesign. `origin` is the conflict rule between the two
-- write paths: the listings.json sync only ever touches its own rows, so a
-- user submission can never be clobbered by the next automation run.

alter table public.hackathons
  add column if not exists origin       text,
  add column if not exists description  text,
  add column if not exists logo_url     text,
  add column if not exists host_type    text,
  add column if not exists submitted_by text;

-- Everything that exists today arrived via the sync.
update public.hackathons set origin = 'listings_json' where origin is null;

alter table public.hackathons
  alter column origin set default 'listings_json',
  alter column origin set not null;

alter table public.hackathons
  drop constraint if exists hackathons_origin_check,
  add constraint hackathons_origin_check
    check (origin in ('listings_json', 'user'));

alter table public.hackathons
  drop constraint if exists hackathons_host_type_check,
  add constraint hackathons_host_type_check
    check (host_type is null or host_type in ('university', 'community', 'company'));

create index if not exists hackathons_origin_idx on public.hackathons (origin);
```

- [ ] **Step 2: Apply it**

`apply_migration`, `name: add_deck_columns`.

- [ ] **Step 3: Verify the backfill and the constraint**

```sql
select origin, count(*) from public.hackathons group by origin;
```

Expected: one row — `listings_json | 32`.

```sql
insert into public.hackathons (id, host, title, url, origin)
values (gen_random_uuid(), 'x', 'x', 'x', 'nonsense');
```

Expected: **fails** with a check-constraint violation. If it succeeds, delete the row and fix the constraint.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722000200_add_deck_columns.sql
git commit -m "feat(db): add origin, description, logo_url, host_type, submitted_by"
```

---

### Task 4: Make the sync declare its own rows

**Files:**
- Modify: `.github/scripts/seed_supabase.py` (`build_row`)
- Test: `.github/scripts/test_scripts.py`

**Interfaces:**
- Consumes: Task 3's `origin` column.
- Produces: `seed.build_row(listing) -> dict` now includes `"origin": "listings_json"`. Task 6 runs it.

- [ ] **Step 1: Write the failing test**

Append to `.github/scripts/test_scripts.py`:

```python
class BuildRowOrigin(unittest.TestCase):
    LISTING = {
        "id": "06f72ca6-9ab3-4d22-aa00-bf5c8b362c33",
        "company_name": "Major League Hacking",
        "title": "Some Hackathon",
        "url": "https://example.com/",
    }

    def test_rows_declare_they_came_from_listings_json(self):
        # The conflict rule: the sync must never be able to overwrite a row a
        # user submitted through the site.
        self.assertEqual(seed.build_row(self.LISTING)["origin"], "listings_json")

    def test_company_name_is_still_stored_as_host(self):
        self.assertEqual(seed.build_row(self.LISTING)["host"], "Major League Hacking")
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/josegaelcruzlopez/Desktop/hackhq
python -m unittest discover -s .github/scripts -p 'test_*.py' -k BuildRowOrigin
```

Expected: FAIL — `KeyError: 'origin'`.

- [ ] **Step 3: Add the field**

In `.github/scripts/seed_supabase.py`, inside the dict returned by `build_row`, after the `"featured"` line:

```python
        "featured": bool(listing.get("featured", False)),
        # Declares which write path produced this row. The upsert below filters
        # on it so user submissions are never overwritten by the sync.
        "origin": "listings_json",
```

- [ ] **Step 4: Run it and watch it pass**

```bash
python -m unittest discover -s .github/scripts -p 'test_*.py' -k BuildRowOrigin
```

Expected: `OK`, 2 tests.

- [ ] **Step 5: Run the whole suite**

```bash
python -m unittest discover -s .github/scripts -p 'test_*.py'
```

Expected: `OK`. This suite includes `test_workflows.py`; a failure there means something unrelated broke.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/seed_supabase.py .github/scripts/test_scripts.py
git commit -m "feat(scripts): stamp synced rows with origin=listings_json"
```

---

### Task 5: Fix the RLS policies

Today there is one policy: `SELECT` for `anon` where `is_visible`. Two consequences — signed-in users would see an empty board, and nobody but `service_role` can write.

**Files:**
- Create: `supabase/migrations/20260722000300_rls_policies.sql`

**Interfaces:**
- Consumes: Task 3's `submitted_by` and `origin`.
- Produces: read access for `anon` **and** `authenticated`; insert/update/delete for `authenticated` restricted to their own rows. Plan 3's Add Opportunity route depends on the insert policy.

`auth.jwt() ->> 'sub'` is the Clerk user id once Clerk is configured as a third-party auth provider. Until that configuration exists the write policies match nothing, which is the safe failure direction — reads keep working.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260722000300_rls_policies.sql
-- Read: both roles. The old policy named only `anon`, so a signed-in visitor
-- would have seen an empty board the moment Clerk auth landed.
-- Write: authenticated users, only their own rows, and never a synced row.

drop policy if exists "public read" on public.hackathons;

create policy "read visible hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (is_visible = true);

create policy "insert own submissions"
  on public.hackathons for insert
  to authenticated
  with check (
    origin = 'user'
    and submitted_by = auth.jwt() ->> 'sub'
  );

create policy "update own submissions"
  on public.hackathons for update
  to authenticated
  using (origin = 'user' and submitted_by = auth.jwt() ->> 'sub')
  with check (origin = 'user' and submitted_by = auth.jwt() ->> 'sub');

create policy "delete own submissions"
  on public.hackathons for delete
  to authenticated
  using (origin = 'user' and submitted_by = auth.jwt() ->> 'sub');
```

- [ ] **Step 2: Apply it**

`apply_migration`, `name: rls_policies`.

- [ ] **Step 3: Verify the policy set**

```sql
select polname, polcmd,
       array(select rolname from pg_roles where oid = any(polroles)) as roles
from pg_policy where polrelid = 'public.hackathons'::regclass
order by polname;
```

Expected four policies. `read visible hackathons` must list **both** `anon` and `authenticated`.

- [ ] **Step 4: Verify anon still reads exactly the visible rows**

```sql
set role anon;
select count(*) from public.hackathons;
reset role;
```

Expected: `32`. If this returns 0, the read policy is wrong and the live site would break — fix before continuing.

- [ ] **Step 5: Verify an unauthenticated write is refused**

```sql
set role anon;
insert into public.hackathons (id, host, title, url, origin)
values (gen_random_uuid(), 'x', 'x', 'x', 'user');
reset role;
```

Expected: **fails** with a row-level-security violation.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260722000300_rls_policies.sql
git commit -m "fix(db): let signed-in users read, and write only their own rows"
```

---

### Task 6: Run the sync on a schedule

The sync has run exactly once, by hand, on 2026-07-14 against data from 2026-07-04. Supabase holds 32 rows; `listings.json` holds 79. Until this closes, Supabase cannot become the source the site reads.

**Files:**
- Create: `.github/workflows/sync_supabase.yml`

**Interfaces:**
- Consumes: Task 4's `build_row`.
- Produces: a Supabase table whose row count tracks `listings.json`. Plan 2's `HackathonSource` depends on it.

This workflow commits nothing and never touches the banner, so the `test_workflows.py` gating rules do not apply to it. Do not add a `git diff --quiet` gate.

- [ ] **Step 1: Confirm the repository secrets exist**

```bash
gh secret list --repo Hack-HQ/hackhq | grep -i supabase
```

Expected: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
If either is missing, stop — ask the maintainer to add it. Do not print the values.

- [ ] **Step 2: Write the workflow**

```yaml
# .github/workflows/sync_supabase.yml
name: Sync Supabase

on:
  push:
    branches: [main]
    paths:
      - '.github/scripts/listings.json'
      - '.github/scripts/seed_supabase.py'
  schedule:
    # Hourly. The site's ISR window is an hour, so syncing faster buys nothing.
    - cron: '17 * * * *'
  workflow_dispatch:

concurrency:
  group: sync-supabase
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r .github/scripts/requirements.txt
      - name: Push listings.json into Supabase
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: python .github/scripts/seed_supabase.py
```

- [ ] **Step 3: Verify the suite still passes**

```bash
python -m unittest discover -s .github/scripts -p 'test_*.py'
```

Expected: `OK`. `test_workflows.py` inspects every workflow file; a failure here means the new file tripped a gating rule.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/sync_supabase.yml
git commit -m "feat(ci): sync listings.json into Supabase hourly and on change"
git push
```

- [ ] **Step 5: Record that the run itself is deferred, and why**

**Do not try to dispatch the workflow from this branch.** GitHub only exposes a
`workflow_dispatch` workflow once its file exists on the repository's *default*
branch, so `gh workflow run sync_supabase.yml` will fail with "workflow not
found" until this branch merges. That is a platform constraint, not a mistake to
work around — do not push the workflow straight to `main` to get around it, and
do not attempt to run `seed_supabase.py` locally, which would require handling
the service key.

Confirm the pre-merge state instead, so the post-merge delta is unambiguous:

```sql
select origin, count(*) from public.hackathons group by origin;
```

Expected right now: `listings_json | 32`. Record it.

- [ ] **Step 6: Confirm the deferred verification is written down**

The row count closing from 32 to 79 is this plan's headline outcome, and it
cannot happen until merge. Make sure it does not get lost: state plainly in your
report that after this branch merges to `main`, someone must run

```bash
gh workflow run sync_supabase.yml --repo Hack-HQ/hackhq
gh run watch --repo Hack-HQ/hackhq
```

and then confirm:

```sql
select origin, count(*) from public.hackathons group by origin;
select count(*) filter (where is_visible) as visible,
       count(*) filter (where lat is not null) as geocoded
from public.hackathons;
```

Expected after that run: `listings_json | 79`, `visible = 79`. `geocoded` will
still be `0` — the geocoder has never run, and Plan 2 must not switch `/globe`
to this source until it has.

If the hourly cron fires first, it does the same job; the manual dispatch just
avoids waiting up to an hour.

---

## Definition of done

- `list_migrations` shows four migrations, and `supabase/migrations/` holds the same four files.
- `get_advisors(type: security)` returns no `rls_auto_enable` lints.
- `select count(*) from public.hackathons` returns 79, all `origin = 'listings_json'`.
- Four RLS policies exist; `anon` reads 32+ rows; `anon` cannot insert.
- `python -m unittest discover -s .github/scripts -p 'test_*.py'` passes.
- The web app is untouched — `git diff main --stat -- web/` is empty.

## Known gaps carried forward

- **Geocoding has never run.** All rows have null `lat`/`lng`. *(Plan 2)* `/globe` must keep reading `listings.json` until that is fixed; only `/deck` can move first.
- **Clerk third-party auth is not configured** in Supabase, so the write policies added in Task 5 match nothing yet. Reads are unaffected, which is the safe failure direction. *(Plan 3)* configures it before the Add Opportunity route needs it. The spec lists this under phase 2; it is deferred because nothing reads or writes as an authenticated user until Plan 3, and configuring it earlier could only rot.
