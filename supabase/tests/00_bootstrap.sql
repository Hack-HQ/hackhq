-- supabase/tests/00_bootstrap.sql
-- Stands up the parts of a Supabase-shaped database that this repo's migrations
-- assume but do not create. Run this once, as a superuser, against an empty
-- database, before replaying supabase/migrations/*.sql.
--
-- The authoritative list of those assumptions is
-- `supabase/migrations/20260722190741_make_api_role_grants_explicit.sql:30-38`:
--
--   * the anon / authenticated / service_role roles themselves;
--   * auth.jwt(), which every write policy calls;
--   * gen_random_uuid() for the id default (20260722154341);
--   * ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions to anon and
--     authenticated - the thing 20260722185256 and 20260722190603 revoke;
--   * rls_auto_enable() and the ensure_rls event trigger.
--
-- Four of those five are created below. gen_random_uuid() needs nothing: it is
-- built into PostgreSQL since 13, so no pgcrypto extension is required.
--
-- rls_auto_enable() is deliberately NOT created. 20260722142728 and
-- 20260722143346 wrap their revokes in `if exists` precisely so its absence does
-- not stop the chain, and a replay without it is the only thing that ever
-- exercises those guards. If a future edit drops a guard, the replay in
-- .github/workflows/db-invariants.yml fails on that migration - which is the
-- point.

-- ---------------------------------------------------------------------------
-- 1. The three API roles.
-- ---------------------------------------------------------------------------
--
-- Shaped like Supabase's: NOLOGIN because PostgREST connects as `authenticator`
-- and reaches them with SET LOCAL ROLE, NOINHERIT for the same reason.
--
-- BYPASSRLS on service_role is not cosmetic - it is the single attribute that
-- makes service mode behave the way production does. Every claim in
-- 20260818013000 about what is "masked today" rests on it: with BYPASSRLS the
-- policies on public.user_hackathons are never consulted for the hourly sync, so
-- the suite can assert the service-mode no-op behaviour that #235 will change.
-- Without it, a test asserting "service_role is unaffected" would be testing a
-- role that does not exist anywhere.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- PUBLIC holds USAGE on schema public by default, but not through any grant the
-- migrations can see. Make it explicit so a hosting project that has revoked
-- PUBLIC's USAGE is still reproduced faithfully.
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. auth.jwt().
-- ---------------------------------------------------------------------------
--
-- Supabase's real shape: the verified claims arrive as a per-request GUC that
-- PostgREST sets with `set local request.jwt.claims = '<json>'` inside the same
-- transaction as `set local role`. Nothing about it is magic, which is why a
-- test can become a user with two SET statements.
--
-- `nullif(..., '')` matters: current_setting(..., true) returns '' rather than
-- NULL for a GUC that was set and then reset within a session, and ''::jsonb
-- raises. Returning '{}'::jsonb makes `auth.jwt() ->> 'sub'` NULL for a caller
-- with no token - the service_role / psql case that 20260818013000:73-79 and
-- 20260722190603:16-18 both key on.
create schema if not exists auth;

grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- 3. Supabase's stock grant-all bootstrap.
-- ---------------------------------------------------------------------------
--
-- Replicated because several migrations exist for no other purpose than to
-- REVOKE it, and a replay without it would make those revokes vacuous - they
-- would report success against a privilege that was never there, the suite would
-- pass, and the assertions would be proving nothing:
--
--   20260722154244  revokes TRUNCATE / REFERENCES / TRIGGER on hackathons
--   20260722163257  revokes the table-level write grants, hands back a column list
--   20260722185202  revokes anon's SELECT, hands back a column list
--   20260722192614  revokes authenticated's SELECT, hands back a column list
--   20260725154500  `revoke all ... from anon` on user_hackathons
--   20260818013000  revokes the table-level writes on user_hackathons
--
-- Four of those chased the wrong privilege holder and silently changed nothing
-- (20260722185256:1-13, 20260722192614:16-19 count them). The only way an
-- assertion can tell a real revoke from that class of no-op is to start from the
-- state the real database starts from.
--
-- ALTER DEFAULT PRIVILEGES applies to objects created by the role that issues it
-- and is deliberately left unqualified here, so it attaches to whoever runs this
-- file - which must be the same role that then replays the migrations.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- The functions clause is the one 20260722185256 and 20260722190603 revoke:
-- a new function receives EXECUTE from PUBLIC by Postgres default AND from
-- anon/authenticated through this line. Revoking either alone leaves the other,
-- which is the lesson of 20260722192614:5-19 - and it is unassertable unless
-- both sources are present to begin with.
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Guard: this file only makes sense on an empty database.
-- ---------------------------------------------------------------------------
--
-- The ALTER DEFAULT PRIVILEGES above only affect tables and functions created
-- *after* this point. If public.hackathons already exists, the migrations have
-- already run, the grant-all state was never in place, and every revoke
-- assertion in 10_invariants.sql would be vacuous. Fail loudly instead.
do $$
begin
  if exists (select 1 from pg_class
             where relname in ('hackathons', 'user_hackathons')
               and relnamespace = 'public'::regnamespace) then
    raise exception
      '00_bootstrap.sql must run before the migrations, on an empty database'
      using hint = 'The stock grant-all default privileges only reach objects '
                   'created after this file runs, so the revokes the suite '
                   'asserts would have nothing to revoke.';
  end if;
end $$;
