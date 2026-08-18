-- supabase/tests/10_invariants.sql
-- Executable assertions for the privilege and policy invariants that
-- supabase/migrations/ establishes. Run after 00_bootstrap.sql and after every
-- migration, in filename order, on a throwaway database. Silence is a pass;
-- the first broken invariant raises and, under `psql -v ON_ERROR_STOP=1`, stops
-- the run.
--
-- Why this file exists: almost everything it checks is currently unreachable in
-- production. `service_role` bypasses RLS, so the web app's service-mode client
-- consults no policy and binds no column grant on public.user_hackathons
-- (20260818013000:7-11). The moment SUPABASE_ANON_KEY is set for #235, all of it
-- becomes load-bearing at once. A policy bug today is invisible; the same bug
-- after the flip is a cross-tenant read. So it gets asserted now.
--
-- Plain SQL and `do` blocks, deliberately: pgTAP is not installable on a stock
-- `postgres` service image, and the point of this suite is that it needs no
-- Supabase project, no extension, no credentials and no network.
--
-- Every failure message names the invariant and the migration that establishes
-- it, because the useful question when this file goes red is never "what broke"
-- but "which decision am I about to reverse, and did I mean to".
--
-- Must run as a superuser or the table owner. information_schema.* only shows
-- privileges whose grantor or grantee is a currently enabled role, and the
-- behavioural section needs SET ROLE into all three API roles.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 0. Preflight.
-- ---------------------------------------------------------------------------

do $$
begin
  if not (pg_has_role(current_user, 'anon', 'MEMBER')
          and pg_has_role(current_user, 'authenticated', 'MEMBER')
          and pg_has_role(current_user, 'service_role', 'MEMBER')) then
    raise exception
      'PREFLIGHT: % cannot SET ROLE into the API roles', current_user
      using hint = 'Run this file as a superuser. The behavioural section '
                   'becomes each API role with SET ROLE, and information_schema '
                   'hides grants made to roles the caller is not a member of, '
                   'so a non-superuser run would pass vacuously.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. public.hackathons - submitted_by is not readable by an API role.
-- ---------------------------------------------------------------------------
--
-- submitted_by is the submitter's Clerk user id. Exposing it to anon lets anyone
-- holding the publishable key enumerate and correlate submitters
-- (20260722185202:20-24); exposing it to authenticated moves that barrier to
-- "sign up", which is not a barrier (20260722192614:27-30).
--
-- Checked twice, on purpose. information_schema.column_privileges lists grants
-- as recorded, which is what a `grant select (...)` line produces and therefore
-- what a careless edit to those lines would show. has_column_privilege answers
-- the question the executor actually asks, and it resolves privileges reached
-- through role membership or through PUBLIC - a path a direct grant on the role
-- never appears on, and the one a future `grant ... to public` would take.

do $$
declare
  offenders text;
begin
  select string_agg(grantee, ', ' order by grantee) into offenders
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name   = 'hackathons'
    and column_name  = 'submitted_by'
    and privilege_type = 'SELECT'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if offenders is not null then
    raise exception
      'INVARIANT public.hackathons.submitted_by is not selectable by an API role: '
      'information_schema reports a SELECT grant to %', offenders
      using detail = 'Established by 20260722185202:25-30 (anon) and '
                     '20260722192614:35-40 (authenticated), both of which revoke '
                     'table-level SELECT and hand back a 25-column list that '
                     'omits submitted_by.',
            hint = 'submitted_by is a Clerk user id. If a read path needs it, '
                   'expose it through a view or a security-definer function '
                   'that filters to the caller''s own rows.';
  end if;
end $$;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_column_privilege(role_name, 'public.hackathons', 'submitted_by', 'SELECT') then
      raise exception
        'INVARIANT public.hackathons.submitted_by is not selectable by an API role: '
        'has_column_privilege says % can read it', role_name
        using detail = 'Established by 20260722185202:25-30 and '
                       '20260722192614:35-40. has_column_privilege disagreeing '
                       'with information_schema means the privilege arrives '
                       'through PUBLIC or through role membership rather than '
                       'through a grant naming this role.',
              hint = 'Look for `grant <role> to anon with inherit true` (or to '
                     'authenticated), which is the only membership shape that '
                     'escalates: both roles are NOINHERIT, and PostgreSQL 16+ '
                     'records the inherit option per grant, so a plain '
                     '`grant <role> to anon` confers nothing without SET ROLE. '
                     'Verified both ways on 18.4.';
    end if;
  end loop;
end $$;

-- The complement, so that "hide submitted_by" can never be satisfied by hiding
-- everything. The public board renders from this table through the anon key; an
-- over-broad revoke would empty it, and that failure belongs here rather than in
-- a bug report from production.

do $$
declare
  role_name text;
  expected  text[];
  actual    text[];
begin
  select array_agg(attname order by attname) into expected
  from pg_attribute
  where attrelid = 'public.hackathons'::regclass
    and attnum > 0
    and not attisdropped
    and attname <> 'submitted_by';

  if array_length(expected, 1) <> 25 then
    raise exception
      'INVARIANT public.hackathons has 26 columns, 25 of them API-readable: '
      'found % non-submitted_by columns', array_length(expected, 1)
      using detail = 'The column lists in 20260722185202:26-30 and '
                     '20260722192614:36-40 are literal. A column added by a '
                     'later migration is invisible to both API roles until it '
                     'is added to them, which is the safe default but has to be '
                     'a decision rather than an oversight.',
            hint = 'Add the new column to both grant lists, or extend this '
                   'assertion to say why it stays hidden.';
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    select array_agg(attname order by attname) into actual
    from pg_attribute
    where attrelid = 'public.hackathons'::regclass
      and attnum > 0
      and not attisdropped
      and has_column_privilege(role_name, 'public.hackathons', attname, 'SELECT');

    if actual is distinct from expected then
      raise exception
        'INVARIANT % reads exactly the 25 non-submitted_by columns of '
        'public.hackathons: got %', role_name, coalesce(actual::text, '(none)')
        using detail = 'Established by 20260722185202:25-30 and '
                       '20260722192614:35-40. Too few breaks the public board '
                       '(and, via the read policy, a submitter''s access to '
                       'their own row - 20260722185202:1-10); too many leaks '
                       'submitter identity.';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. public.hackathons - anon never writes, and no API role holds TRUNCATE.
-- ---------------------------------------------------------------------------
--
-- has_any_column_privilege rather than has_table_privilege for INSERT/UPDATE:
-- the whole design here is column-level grants, and has_table_privilege reports
-- false for a role holding every column individually. TRUNCATE and DELETE have
-- no column form, so they use has_table_privilege.
--
-- TRUNCATE is the one privilege on this table that no policy can defend - RLS
-- does not apply to it (20260722154244:5-11). REFERENCES and TRIGGER go with it
-- because an API role has no business creating either.
--
-- MAINTAIN belongs in that same list and is now asserted. It was found by this
-- very replay: `grant all on tables` on PostgreSQL 17+ includes MAINTAIN
-- (VACUUM, ANALYZE, CLUSTER, REINDEX, REFRESH MATERIALIZED VIEW), nothing
-- revoked it, and a replayed chain ended at `anon=m`. It grants no row access,
-- so it was never a disclosure - it is the ability to make the server do
-- expensive work on demand, reachable by anyone holding the publishable anon
-- key. 20260818014500 revokes it, version-guarded because the privilege does
-- not exist before PG17, and the assertion below is what stops it drifting
-- back. Guarded the same way, so this suite still passes on an older server.

do $$
declare
  priv text;
  tbl text;
  role_name text;
begin
  foreach priv in array array['INSERT', 'UPDATE'] loop
    if has_any_column_privilege('anon', 'public.hackathons', priv) then
      raise exception
        'INVARIANT anon holds no write privilege on public.hackathons: has %', priv
        using detail = 'Established by 20260722163257:15 - `revoke insert, '
                       'update, delete on public.hackathons from anon`. The '
                       'write policies name only `authenticated`, so a grant to '
                       'anon is not policy-gated, it is unreachable-by-luck.';
    end if;
  end loop;

  if has_table_privilege('anon', 'public.hackathons', 'DELETE') then
    raise exception
      'INVARIANT anon holds no write privilege on public.hackathons: has DELETE'
      using detail = 'Established by 20260722163257:15.';
  end if;

  foreach priv in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.hackathons', priv) then
      raise exception
        'INVARIANT no API role holds % on public.hackathons: anon has it', priv
        using detail = 'Established by 20260722154244:15-17. RLS does not apply '
                       'to TRUNCATE, so unlike INSERT/UPDATE/DELETE there is no '
                       'policy behind this grant.';
    end if;
    if has_table_privilege('authenticated', 'public.hackathons', priv) then
      raise exception
        'INVARIANT no API role holds % on public.hackathons: authenticated has it', priv
        using detail = 'Established by 20260722154244:15-17. RLS does not apply '
                       'to TRUNCATE, so unlike INSERT/UPDATE/DELETE there is no '
                       'policy behind this grant.';
    end if;
  end loop;

  -- Version-guarded to match 20260818014500: MAINTAIN does not exist before
  -- PG17, and has_table_privilege raises rather than returning false for a
  -- privilege name the server does not know.
  if current_setting('server_version_num')::int >= 170000 then
    foreach tbl in array array['public.hackathons', 'public.user_hackathons'] loop
      foreach role_name in array array['anon', 'authenticated'] loop
        if has_table_privilege(role_name, tbl, 'MAINTAIN') then
          raise exception
            'INVARIANT no API role holds MAINTAIN on %: % has it', tbl, role_name
            using detail = 'Established by 20260818014500. Supabase''s stock '
                           '`grant all on tables` includes MAINTAIN on PG17+, and '
                           'nothing revoked it until that migration. It grants no '
                           'row access - it grants VACUUM/ANALYZE/CLUSTER/REINDEX, '
                           'i.e. expensive work on demand, to a role a browser can '
                           'reach with the publishable anon key.',
                 hint = 'service_role keeps MAINTAIN deliberately, as it keeps '
                        'TRUNCATE. Only anon and authenticated are asserted here.';
        end if;
      end loop;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. public.hackathons - the submitted_by write asymmetry, verbatim.
-- ---------------------------------------------------------------------------
--
-- INSERT yes, UPDATE no. That is the design, not an accident: the insert policy
-- requires submitted_by = the caller's own sub, so a submitter must be able to
-- set it once; withholding UPDATE is what makes a row un-re-ownable and
-- un-giftable afterwards (20260722163257:28-32). The same reasoning is why
-- 20260818013000:141-146 withholds UPDATE on user_hackathons.user_id.
--
-- Set equality on both lists, not membership: a widened grant is exactly the
-- change this is here to catch, and a widened grant adds columns rather than
-- removing them.

do $$
declare
  expected_insert text[] := array[
    'deadline', 'description', 'endDate', 'format', 'host', 'host_type',
    'locations', 'logo_url', 'origin', 'prize', 'startDate', 'submitted_by',
    'title', 'url'];
  expected_update text[] := array[
    'deadline', 'description', 'endDate', 'format', 'host', 'host_type',
    'locations', 'logo_url', 'prize', 'startDate', 'title', 'url'];
  actual text[];
begin
  if not has_column_privilege('authenticated', 'public.hackathons', 'submitted_by', 'INSERT') then
    raise exception
      'INVARIANT authenticated may INSERT public.hackathons.submitted_by but never UPDATE it: '
      'the INSERT half is missing'
      using detail = 'Established by 20260722163257:23-26. The insert policy '
                     '(20260722163210:29-35) requires submitted_by to equal the '
                     'caller''s JWT sub, so revoking the column makes every '
                     'submission fail the policy it is required to satisfy.';
  end if;

  if has_column_privilege('authenticated', 'public.hackathons', 'submitted_by', 'UPDATE') then
    raise exception
      'INVARIANT authenticated may INSERT public.hackathons.submitted_by but never UPDATE it: '
      'UPDATE has been granted'
      using detail = 'Established by 20260722163257:28-32 - submitted_by and '
                     'origin are absent from the UPDATE list so a row can never '
                     'be re-owned or handed to another account. Re-owning also '
                     'strips the original submitter of their own row via the '
                     'update/delete policies (20260722154046:11-15).';
  end if;

  select array_agg(column_name order by column_name) into actual
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'hackathons'
    and grantee = 'authenticated' and privilege_type = 'INSERT';

  if actual is distinct from (select array_agg(c order by c) from unnest(expected_insert) c) then
    raise exception
      'INVARIANT authenticated''s INSERT columns on public.hackathons are exactly '
      'the 14 submission fields: got %', coalesce(actual::text, '(none)')
      using detail = 'Established by 20260722163257:23-26. Everything curated '
                     '(featured), derived (lat, lng, geo_status, state) or '
                     'bookkeeping (date_posted, date_updated, synced_at, source, '
                     'is_visible, active) is withheld so no policy has to defend '
                     'it. `id` is withheld so a user row cannot be aimed at an '
                     'existing listings.json uuid (20260722154341:1-8).';
  end if;

  select array_agg(column_name order by column_name) into actual
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'hackathons'
    and grantee = 'authenticated' and privilege_type = 'UPDATE';

  if actual is distinct from (select array_agg(c order by c) from unnest(expected_update) c) then
    raise exception
      'INVARIANT authenticated''s UPDATE columns on public.hackathons are exactly '
      'the 12 editable fields: got %', coalesce(actual::text, '(none)')
      using detail = 'Established by 20260722163257:30-32.';
  end if;
end $$;

-- authenticated's table-level SELECT and DELETE, and service_role's writes, are
-- granted by nothing but 20260722190741 on a bootstrap-less database. Assert
-- them so that migration cannot be deleted as "redundant with Supabase's stock
-- grant-all" - which is precisely the assumption it exists to remove.

do $$
begin
  if not has_table_privilege('authenticated', 'public.hackathons', 'DELETE') then
    raise exception
      'INVARIANT authenticated holds DELETE on public.hackathons'
      using detail = 'Established by 20260722190741:22. A policy only narrows a '
                     'privilege, it never confers one, so "delete own '
                     'submissions" (20260722163210) is unexercisable without '
                     'this grant.';
  end if;

  if not (has_table_privilege('service_role', 'public.hackathons', 'SELECT')
          and has_table_privilege('service_role', 'public.hackathons', 'INSERT')
          and has_table_privilege('service_role', 'public.hackathons', 'UPDATE')
          and has_table_privilege('service_role', 'public.hackathons', 'DELETE')) then
    raise exception
      'INVARIANT service_role holds full DML on public.hackathons'
      using detail = 'Established by 20260722190741:27. This is the role '
                     '.github/scripts/seed_supabase.py authenticates as; without '
                     'the grant the hourly sync fails outright on a '
                     'bootstrap-less database.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. public.hackathons - triggers, RLS, policies.
-- ---------------------------------------------------------------------------
--
-- Both triggers are BEFORE UPDATE FOR EACH ROW: tgtype 19 = ROW(1) | BEFORE(2) |
-- UPDATE(16). They are triggers rather than policies because service_role
-- bypasses RLS and the sync is exactly the writer they must constrain
-- (20260722154046:3-6). A policy could not do this job for any role.

do $$
declare
  t record;
  found int;
begin
  for t in select * from (values
      ('hackathons_skip_sync_over_user_rows',
       '20260722154046:30-35 - the sync must never re-own a user''s row; '
       'flipping origin also drops the row out of the update/delete policies, '
       'silently and permanently unowning it'),
      ('hackathons_clear_featured_on_content_swap',
       '20260722190603:59-64 - curation earned on one listing must not survive '
       'being repointed at different content')
    ) as v(tgname, provenance)
  loop
    select count(*) into found
    from pg_trigger
    where tgrelid = 'public.hackathons'::regclass
      and not tgisinternal
      and tgname = t.tgname
      and tgtype = 19
      and tgenabled <> 'D';

    if found <> 1 then
      raise exception
        'INVARIANT trigger % exists on public.hackathons, enabled, BEFORE UPDATE '
        'FOR EACH ROW (tgtype 19)', t.tgname
        using detail = t.provenance;
    end if;
  end loop;
end $$;

do $$
declare
  n int;
  read_roles text[];
begin
  if not (select relrowsecurity from pg_class where oid = 'public.hackathons'::regclass) then
    raise exception
      'INVARIANT row level security is enabled on public.hackathons'
      using detail = 'Established by 20260722141955:31. Without it the four '
                     'policies below are inert and every grant is table-wide.';
  end if;

  select count(*) into n from pg_policy where polrelid = 'public.hackathons'::regclass;
  if n <> 4 then
    raise exception
      'INVARIANT public.hackathons has exactly 4 policies: found %', n
      using detail = 'read visible hackathons (20260722185202:12-18), plus '
                     'insert/update own submissions (20260722163210:29-42) and '
                     'delete own submissions (20260722153049:45-48). A fifth '
                     'policy is an OR: policies for the same command are '
                     'permissive and combine with OR, so an added one can only '
                     'widen access.';
  end if;

  select array_agg(rolname order by rolname) into read_roles
  from pg_policy p, pg_roles r
  where p.polrelid = 'public.hackathons'::regclass
    and p.polname = 'read visible hackathons'
    and r.oid = any(p.polroles);

  if read_roles is distinct from array['anon', 'authenticated'] then
    raise exception
      'INVARIANT the SELECT policy on public.hackathons applies to anon AND '
      'authenticated: got %', coalesce(read_roles::text, '(none / PUBLIC)')
      using detail = 'Established by 20260722145817:18-21 and reaffirmed by '
                     '20260722185202:12-18. Naming only anon is the original '
                     'bug: a signed-in visitor saw an empty board '
                     '(20260722145817:11-12).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. public.user_hackathons - anon holds nothing at all.
-- ---------------------------------------------------------------------------
--
-- A per-user tracker has no public read, so unlike public.hackathons there is no
-- column list to hand back - anon is simply absent from the ACL
-- (20260725154500:78, 88).

do $$
declare
  priv text;
  rows_found text;
begin
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_any_column_privilege('anon', 'public.user_hackathons', priv) then
      raise exception
        'INVARIANT anon holds no privilege of any kind on public.user_hackathons: has %', priv
        using detail = 'Established by 20260725154500:88 - `revoke all on '
                       'public.user_hackathons from anon`, undoing Supabase''s '
                       'stock grant-all for new tables in schema public.';
    end if;
  end loop;

  foreach priv in array array['DELETE', 'TRUNCATE', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.user_hackathons', priv) then
      raise exception
        'INVARIANT anon holds no privilege of any kind on public.user_hackathons: has %', priv
        using detail = 'Established by 20260725154500:88. TRUNCATE especially: '
                       'RLS does not apply to it.';
    end if;
  end loop;

  select string_agg(distinct privilege_type, ', ') into rows_found
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'user_hackathons' and grantee = 'anon';

  if rows_found is not null then
    raise exception
      'INVARIANT anon holds no privilege of any kind on public.user_hackathons: '
      'information_schema still lists %', rows_found
      using detail = 'Established by 20260725154500:88.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. public.user_hackathons - authenticated's write columns, exactly.
-- ---------------------------------------------------------------------------
--
-- Set equality, not membership. Widening is the failure mode: a table-level
-- `grant insert, update` would satisfy any membership check while re-opening
-- both holes 20260818013000 closes - user_id becomes UPDATE-able (a row can be
-- re-owned by a caller whose own claim satisfies the policy) and created_at
-- becomes forgeable.
--
-- user_id stays INSERT-grantable on purpose: web/lib/tracker-store.ts names it
-- on the import path and public.upsert_tracker_row names it in its own insert
-- column list, so withholding it would break both under token mode. The trigger
-- asserted in section 7 is what makes naming it safe (20260818013000:130-137).
--
-- SELECT is deliberately table-wide here, unlike public.hackathons: every column
-- is the caller's own data and the read policy already restricts which rows they
-- are (20260818013000:148-151).

do $$
declare
  spec record;
  actual text[];
begin
  for spec in select * from (values
      ('INSERT', array['hackathon_id', 'is_win', 'stage', 'updated_at', 'user_id'],
       '20260818013000:138-139'),
      ('UPDATE', array['is_win', 'stage', 'updated_at'],
       '20260818013000:145-146 - user_id and hackathon_id identify the row, they '
       'are not payload, so a row can never be re-owned or re-pointed; '
       'created_at is absent from both lists because no code path writes it')
    ) as v(priv, cols, provenance)
  loop
    select array_agg(column_name order by column_name) into actual
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'user_hackathons'
      and grantee = 'authenticated' and privilege_type = spec.priv;

    if actual is distinct from (select array_agg(c order by c) from unnest(spec.cols) c) then
      raise exception
        'INVARIANT authenticated''s % columns on public.user_hackathons are exactly '
        '%: got %', spec.priv, spec.cols::text, coalesce(actual::text, '(none)')
        using detail = 'Established by ' || spec.provenance ||
                       '. Note that a table-level grant expands to every column '
                       'in information_schema, so this catches '
                       '`grant insert, update on ... to authenticated` as well '
                       'as a widened column list.';
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.user_hackathons', 'SELECT') then
    raise exception
      'INVARIANT authenticated holds table-wide SELECT on public.user_hackathons'
      using detail = 'Established by 20260725154500:79 and left alone by '
                     '20260818013000:148-151. The read policy is what restricts '
                     'rows; there is no column here that exposes another user.';
  end if;
end $$;

do $$
declare
  n int;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.user_hackathons'::regclass) then
    raise exception
      'INVARIANT row level security is enabled on public.user_hackathons'
      using detail = 'Established by 20260725154500:41. This is the whole '
                     'cross-tenant boundary once #235 moves the client onto the '
                     'user''s Clerk token.';
  end if;

  select count(*) into n from pg_policy where polrelid = 'public.user_hackathons'::regclass;
  if n <> 4 then
    raise exception
      'INVARIANT public.user_hackathons has exactly 4 owner-only policies: found %', n
      using detail = 'read/insert/update/delete own tracker, '
                     '20260725154500:47-74. Policies for one command combine '
                     'with OR, so a fifth can only widen the tenant boundary.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. public.user_hackathons - the owner-forcing trigger.
-- ---------------------------------------------------------------------------
--
-- tgtype 23 = ROW(1) | BEFORE(2) | INSERT(4) | UPDATE(16). BEFORE matters: RLS
-- `with check` is evaluated against the row as a BEFORE trigger leaves it
-- (confirmed on PostgreSQL 18.4 - a trigger that rewrote user_id turned a policy
-- violation into an accepted row), which is exactly why this one raises instead
-- of rewriting (20260818013000:30-37).

do $$
declare
  found int;
begin
  select count(*) into found
  from pg_trigger
  where tgrelid = 'public.user_hackathons'::regclass
    and not tgisinternal
    and tgname = 'user_hackathons_force_owner'
    and tgtype = 23
    and tgenabled <> 'D';

  if found <> 1 then
    raise exception
      'INVARIANT trigger user_hackathons_force_owner exists, enabled, BEFORE '
      'INSERT OR UPDATE FOR EACH ROW (tgtype 23)'
      using detail = 'Established by 20260818013000:118-120. Without it the '
                     'insert/update policies are the single layer standing '
                     'between a client and a forged owner '
                     '(20260818013000:22-28); a DEFAULT does not help because a '
                     'DEFAULT is only consulted when the column is omitted.',
            hint = 'If the tgtype differs, check that it is still BEFORE: an '
                   'AFTER trigger cannot fill user_id at all, and a rewriting '
                   'BEFORE trigger would launder a policy violation into a '
                   'success.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Trigger functions are not callable, upsert_tracker_row is.
-- ---------------------------------------------------------------------------
--
-- A trigger function has no caller - it is invoked by the trigger, not through
-- EXECUTE. Getting this right needs BOTH revoke forms, because a new function in
-- schema public receives EXECUTE from PUBLIC by Postgres default AND from
-- anon/authenticated through Supabase's ALTER DEFAULT PRIVILEGES. Four migrations
-- on this branch issued only one form and reported success while changing
-- nothing (20260722185256:1-13, 20260722192614:5-19).
--
-- PUBLIC is checked through the ACL rather than has_function_privilege because
-- there is no role named `public`, and because a NULL proacl means "defaults
-- apply", i.e. PUBLIC has EXECUTE - the exact state a fresh `create or replace`
-- without the revokes would leave behind.

do $$
declare
  fn record;
  acl aclitem[];
begin
  for fn in select * from (values
      ('public.force_tracker_owner()',            '20260818013000:113-114'),
      ('public.skip_sync_over_user_rows()',       '20260722192614:24-25'),
      ('public.clear_featured_on_content_swap()', '20260722192614:20-21')
    ) as v(sig, provenance)
  loop
    select coalesce(proacl, acldefault('f', proowner)) into acl
    from pg_proc where oid = fn.sig::regprocedure;

    if exists (select 1 from aclexplode(acl) where grantee = 0 and privilege_type = 'EXECUTE') then
      raise exception
        'INVARIANT trigger function % is not EXECUTE-able by PUBLIC', fn.sig
        using detail = 'Established by ' || fn.provenance || '. A NULL proacl '
                       'counts as a failure: it means Postgres defaults apply, '
                       'and the default is EXECUTE to PUBLIC. `create or '
                       'replace function` preserves an existing ACL, but a '
                       'dropped-and-recreated function starts from the default.';
    end if;

    if has_function_privilege('anon', fn.sig, 'EXECUTE')
       or has_function_privilege('authenticated', fn.sig, 'EXECUTE') then
      raise exception
        'INVARIANT trigger function % is not EXECUTE-able by an API role', fn.sig
        using detail = 'Established by ' || fn.provenance || '. Both revoke '
                       'forms are required - `from public` and `from anon, '
                       'authenticated` - because the grant arrives from two '
                       'independent sources.';
    end if;
  end loop;
end $$;

-- upsert_tracker_row is the deliberate exception: authenticated calls it, and it
-- must stay SECURITY INVOKER. A security definer version would run as its owner,
-- which bypasses both the policies and the column grants asserted above - it
-- would quietly opt out of exactly the enforcement #235 exists to gain
-- (20260810064325:30-34), and the force-owner trigger would see no JWT.

do $$
declare
  sig text := 'public.upsert_tracker_row(text, uuid, text, boolean)';
  p record;
begin
  select prosecdef, proconfig into p from pg_proc where oid = sig::regprocedure;

  if not has_function_privilege('authenticated', sig, 'EXECUTE') then
    raise exception
      'INVARIANT authenticated may EXECUTE %', sig
      using detail = 'Established by 20260810064325:72. web/lib/tracker-store.ts '
                     'calls this function on every PUT /api/tracker; without the '
                     'grant, token mode answers 503 '
                     'TRACKER_BACKEND_UNAVAILABLE.';
  end if;

  if has_function_privilege('anon', sig, 'EXECUTE') then
    raise exception
      'INVARIANT anon may not EXECUTE %', sig
      using detail = 'Established by 20260810064325:70-71 - revoked from PUBLIC '
                     'and from anon. anon holds nothing on '
                     'public.user_hackathons, so a callable upsert would be the '
                     'one way around that.';
  end if;

  if p.prosecdef then
    raise exception
      'INVARIANT % is SECURITY INVOKER', sig
      using detail = 'Established by 20260810064325:44 and argued at :30-34. '
                     'SECURITY DEFINER would run as the owner: RLS skipped, '
                     'column grants skipped, and force_tracker_owner()''s '
                     'auth.jwt() lookup still keyed on the request GUC but with '
                     'no privilege left to enforce.';
  end if;

  if p.proconfig is null
     or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') then
    raise exception
      'INVARIANT % pins its search_path: proconfig is %', sig,
      coalesce(p.proconfig::text, '(null)')
      using detail = 'Established by 20260810064325:45. Every function in this '
                     'schema pins it so name resolution cannot be steered by '
                     'whatever the caller happens to have set - which for a '
                     'SECURITY INVOKER function called by authenticated is '
                     'caller-controlled input.';
  end if;
end $$;

-- The three trigger functions pin it too, for the same reason.

do $$
declare
  fn text;
  cfg text[];
begin
  foreach fn in array array[
    'public.force_tracker_owner()',
    'public.skip_sync_over_user_rows()',
    'public.clear_featured_on_content_swap()'
  ] loop
    select proconfig into cfg from pg_proc where oid = fn::regprocedure;
    if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
      raise exception
        'INVARIANT % pins its search_path: proconfig is %', fn,
        coalesce(cfg::text, '(null)')
        using detail = 'Established by 20260722154046:20, 20260722190603:32 and '
                       '20260818013000:66. A trigger must not resolve names '
                       'through whatever the caller happens to have set.';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Behavioural: become each role and exercise the boundary.
-- ---------------------------------------------------------------------------
--
-- Catalogue assertions cannot tell whether the pieces combine into the
-- behaviour the migrations claim. These can.
--
-- Becoming a user is two SET LOCAL statements, which is exactly what PostgREST
-- does per request: `set local role authenticated` plus `set local
-- request.jwt.claims = '<verified claims json>'`, read back by auth.jwt().
--
-- Each scenario runs in its own transaction and is rolled back, so the suite
-- leaves no rows behind and the GUCs never leak into the next block.

-- 9a. INSERT as authenticated: omitted user_id, explicit NULL user_id, and the
--     forged owner. 20260725154500:13-15 claimed the DEFAULT made forgery
--     impossible; it did not (a DEFAULT is only consulted when the column is
--     omitted, and :79 granted INSERT at table level, which implies every
--     column). The trigger is what makes the claim true of some layer.

begin;
do $$
declare
  hid uuid := gen_random_uuid();
  got text;
  raised boolean;
  msg text;
begin
  perform set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);

  -- Omitted: the column DEFAULT auth.jwt() ->> 'sub' and the trigger agree.
  insert into public.user_hackathons (hackathon_id, stage) values (hid, 'applied');
  select user_id into got from public.user_hackathons where hackathon_id = hid;
  if got is distinct from 'user_a' then
    raise exception
      'INVARIANT an omitted user_id is filled from the JWT sub: got %',
      coalesce(got, '(null)')
      using detail = 'Established by 20260725154500:24 (the column DEFAULT) and '
                     '20260818013000:84-87 (the trigger, which covers the case '
                     'the DEFAULT cannot).';
  end if;

  -- Explicit NULL: the DEFAULT is bypassed, so this is the trigger alone. It is
  -- also the reason the trigger fills rather than only refusing - user_id is NOT
  -- NULL, so without the fill this insert would fail for the wrong reason.
  delete from public.user_hackathons where hackathon_id = hid;
  insert into public.user_hackathons (user_id, hackathon_id) values (null, hid);
  select user_id into got from public.user_hackathons where hackathon_id = hid;
  if got is distinct from 'user_a' then
    raise exception
      'INVARIANT an explicitly NULL user_id is filled from the JWT sub: got %',
      coalesce(got, '(null)')
      using detail = 'Established by 20260818013000:84-87. A DEFAULT cannot do '
                     'this - naming the column, even as NULL, skips it - so '
                     'this case is the trigger and nothing else.';
  end if;

  -- Forged: refused loudly, with 42501 and the trigger's own message. Loudly
  -- rather than silently corrected, so the refusal reaches
  -- web/lib/tracker-store.ts and then Sentry (20260818013000:33-37).
  delete from public.user_hackathons where hackathon_id = hid;
  raised := false;
  begin
    insert into public.user_hackathons (user_id, hackathon_id)
    values ('user_b', hid);
  exception
    when insufficient_privilege then
      raised := true;
      msg := sqlerrm;
    when others then
      raise exception
        'INVARIANT a forged user_id is refused with SQLSTATE 42501: got % (%)',
        sqlstate, sqlerrm
        using detail = 'Established by 20260818013000:93-98. 42501 '
                       'insufficient_privilege, not a check violation: this is '
                       'an authorization failure, and the SQLSTATE is what '
                       'tells web/lib/tracker-errors.ts to keep it a 500 rather '
                       'than classifying it as the transient schema-drift '
                       'condition.';
  end;

  if not raised then
    raise exception
      'INVARIANT a forged user_id is refused: the insert was ACCEPTED'
      using detail = 'Established by 20260818013000:93-98. This is the '
                     'cross-tenant write boundary under token mode (#235).',
            hint = 'If the trigger was changed to rewrite user_id instead of '
                   'raising, the insert now succeeds AND passes the policy - RLS '
                   'with check sees the row as the BEFORE trigger leaves it. '
                   'That is the failure mode 20260818013000:30-37 rejects by '
                   'name.';
  end if;

  if msg not like '%must match the caller%' then
    raise exception
      'INVARIANT the forged-owner refusal comes from force_tracker_owner(), not '
      'from a column grant: message was %', msg
      using detail = 'Established by 20260818013000:93-98. user_id is '
                     'INSERT-grantable (:138-139) precisely so this path reaches '
                     'the trigger; a "permission denied" here would mean the '
                     'grant was withdrawn and the trigger is untested.';
  end if;
end $$;
rollback;

-- 9b. UPDATE as authenticated: user_id is not UPDATE-grantable at all, so
--     re-owning a row fails on the grant before any policy or trigger runs.
--     Two independent layers, which is the point of 20260818013000.

begin;
do $$
declare
  hid uuid := gen_random_uuid();
  raised boolean := false;
begin
  insert into public.user_hackathons (user_id, hackathon_id) values ('user_a', hid);

  perform set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);

  -- The legitimate update still works: this assertion must not pass merely
  -- because authenticated cannot update anything.
  update public.user_hackathons set stage = 'accepted', updated_at = now()
  where hackathon_id = hid;
  if not found then
    raise exception
      'INVARIANT an owner may still move their own row between stages'
      using detail = 'Established by 20260725154500:63-67 (the update policy) '
                     'and 20260818013000:145-146 (the stage/is_win/updated_at '
                     'column grant). If this fails, the hardening has locked '
                     'the owner out of their own row - the exact failure '
                     '20260722163210 and 20260722185202 both had to undo.';
  end if;

  begin
    update public.user_hackathons set user_id = 'user_b' where hackathon_id = hid;
  exception
    when insufficient_privilege then raised := true;
  end;

  if not raised then
    raise exception
      'INVARIANT user_id is not UPDATE-able by authenticated: the update was ACCEPTED'
      using detail = 'Established by 20260818013000:145-146 - user_id is absent '
                     'from the UPDATE grant, so a row cannot be re-owned even '
                     'by a caller whose own claim satisfies the policy. Same '
                     'reasoning as withholding UPDATE on '
                     'public.hackathons.submitted_by (20260722163257:28-29).';
  end if;
end $$;
rollback;

-- 9c. upsert_tracker_row is SECURITY INVOKER, so the trigger constrains it too.
--     A forged p_user_id is refused even though the function's own insert names
--     the column - which is the whole reason the function may keep naming it.

begin;
do $$
declare
  hid uuid := gen_random_uuid();
  got record;
  raised boolean := false;
  msg text;
begin
  perform set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);

  select * into got from public.upsert_tracker_row('user_a', hid, 'applied', null);
  if got.stage is distinct from 'applied' or got.is_win is distinct from false then
    raise exception
      'INVARIANT upsert_tracker_row works for the caller''s own rows: got (%, %)',
      got.stage, got.is_win
      using detail = 'Established by 20260810064325:47-60 and kept working by '
                     '20260818013000:130-137, which leaves user_id and '
                     'updated_at INSERT-grantable precisely because this '
                     'function names them under SECURITY INVOKER.';
  end if;

  -- Partial patch: a null argument means "leave this column alone". Asserted
  -- here because the column grants are what make the ON CONFLICT branch's
  -- `set updated_at` legal; losing that grant would break the merge, not the
  -- insert, and only under token mode.
  select * into got from public.upsert_tracker_row('user_a', hid, null, true);
  if got.stage is distinct from 'applied' or got.is_win is distinct from true then
    raise exception
      'INVARIANT upsert_tracker_row''s null arguments preserve stored values: '
      'got (%, %)', got.stage, got.is_win
      using detail = 'Established by 20260810064325:56-60. The store''s contract '
                     'is that moving a hackathon between stages must not clear '
                     'its win, and recording a win must not reset its stage.';
  end if;

  begin
    perform public.upsert_tracker_row('user_b', gen_random_uuid(), 'applied', null);
  exception
    when insufficient_privilege then
      raised := true;
      msg := sqlerrm;
  end;

  if not raised then
    raise exception
      'INVARIANT upsert_tracker_row cannot write another user''s row: the call SUCCEEDED'
      using detail = 'Established by 20260810064325:44 (SECURITY INVOKER) plus '
                     'the trigger at 20260818013000:118-120. A SECURITY DEFINER '
                     'rewrite of this function would make it a cross-tenant '
                     'write primitive callable by any signed-in user, since '
                     'p_user_id is a plain argument.';
  end if;

  if msg not like '%must match the caller%' then
    raise exception
      'INVARIANT the refusal inside upsert_tracker_row comes from '
      'force_tracker_owner(): message was %', msg
      using detail = 'Established by 20260818013000:93-98.';
  end if;
end $$;
rollback;

-- 9d. Cross-tenant READ is 0 rows, not an error. RLS filters; it does not
--     refuse. web/lib/tracker-store.ts and the /api/tracker error mapping both
--     depend on that: an empty tracker is a normal response, an exception is
--     paged on.

begin;
do $$
declare
  hid uuid := gen_random_uuid();
  n int;
begin
  insert into public.user_hackathons (user_id, hackathon_id) values ('user_a', hid);

  perform set_config('request.jwt.claims', '{"sub":"user_b","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);

  begin
    select count(*) into n from public.user_hackathons where hackathon_id = hid;
  exception
    when others then
      raise exception
        'INVARIANT a cross-tenant read returns 0 rows rather than raising: got % (%)',
        sqlstate, sqlerrm
        using detail = 'Established by 20260725154500:49-52 (the read policy) '
                       'and 20260818013000:148-151 (SELECT left table-wide, so '
                       'no column-privilege error can mask the policy). An '
                       'exception here would turn every empty tracker into a '
                       'Sentry page.';
  end;

  if n <> 0 then
    raise exception
      'INVARIANT a cross-tenant read returns 0 rows: user_b saw % of user_a''s rows', n
      using detail = 'Established by 20260725154500:49-52. This is the read half '
                     'of the tenant boundary #235 makes load-bearing; today '
                     'service_role bypasses it entirely and the boundary is the '
                     'four .eq("user_id", ...) sites in '
                     'web/lib/tracker-store.ts.';
  end if;
end $$;
rollback;

-- 9e. service_role is unaffected. Asserted so that nobody "hardens"
--     force_tracker_owner() into something that also keys on the row - the
--     hourly sync and every server-side path carry no JWT and legitimately
--     supply their own owner (20260818013000:39-43, 73-79).

begin;
do $$
declare
  hid uuid := gen_random_uuid();
  got text;
begin
  perform set_config('role', 'service_role', true);

  if nullif(auth.jwt() ->> 'sub', '') is not null then
    raise exception
      'PRECONDITION service_role carries no JWT claim in this scenario'
      using hint = 'A leaked request.jwt.claims GUC would make the next '
                   'assertion test the wrong thing.';
  end if;

  insert into public.user_hackathons (user_id, hackathon_id) values ('user_b', hid);
  select user_id into got from public.user_hackathons where hackathon_id = hid;

  if got is distinct from 'user_b' then
    raise exception
      'INVARIANT force_tracker_owner() is a no-op without a JWT: user_id became %',
      coalesce(got, '(null)')
      using detail = 'Established by 20260818013000:73-79. Returning NEW '
                     'unchanged is required, not lenient - user_id is NOT NULL, '
                     'and blanking it would break the one path that '
                     'legitimately supplies its own owner. The cross-tenant '
                     'boundary for that path is the app layer (#235), stated '
                     'plainly at 20260818013000:39-43.';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Done. Reaching here means every invariant above holds.
-- ---------------------------------------------------------------------------

do $$ begin raise notice 'supabase/tests/10_invariants.sql: all invariants hold'; end $$;
