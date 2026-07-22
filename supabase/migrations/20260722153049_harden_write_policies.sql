-- supabase/migrations/20260722153049_harden_write_policies.sql
-- Two problems with the three write policies:
--
-- 1. Performance: each policy called auth.jwt() bare, so Postgres
--    re-evaluated it once per candidate row instead of once per statement.
--    get_advisors(type: performance) reported three auth_rls_initplan
--    warnings. Wrapping the call as (select auth.jwt()) lets the planner
--    treat it as an initplan, evaluated once.
--
-- 2. Correctness: the insert/update `with check` clauses validated only
--    origin and submitted_by. An authenticated user could still insert or
--    update their own row with featured = true (load-bearing in the UI,
--    sorts a row to the top) or set lat/lng directly (the geocoder's job,
--    not the submitter's). Both are now blocked by the with check clause.

drop policy if exists "insert own submissions" on public.hackathons;

create policy "insert own submissions"
  on public.hackathons for insert
  to authenticated
  with check (
    origin = 'user'
    and submitted_by = (select auth.jwt()) ->> 'sub'
    and featured = false
    and lat is null
    and lng is null
  );

drop policy if exists "update own submissions" on public.hackathons;

create policy "update own submissions"
  on public.hackathons for update
  to authenticated
  using (origin = 'user' and submitted_by = (select auth.jwt()) ->> 'sub')
  with check (
    origin = 'user'
    and submitted_by = (select auth.jwt()) ->> 'sub'
    and featured = false
    and lat is null
    and lng is null
  );

drop policy if exists "delete own submissions" on public.hackathons;

create policy "delete own submissions"
  on public.hackathons for delete
  to authenticated
  using (origin = 'user' and submitted_by = (select auth.jwt()) ->> 'sub');
