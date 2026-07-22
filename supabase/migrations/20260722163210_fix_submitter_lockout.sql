-- supabase/migrations/20260722163210_fix_submitter_lockout.sql
-- The write policies required featured = false and lat/lng IS NULL in WITH
-- CHECK. That reads like defence, but WITH CHECK evaluates the *resulting*
-- row and cannot consult OLD - so the moment the geocoder filled a user row's
-- coordinates, or a maintainer featured it, the submitter could no longer
-- update their own row at all.
--
-- That is the same failure the conflict-rule trigger exists to prevent: a user
-- silently and permanently losing control of their submission.
--
-- Column privileges are the right mechanism. They stop a user *changing* a
-- column without demanding it hold a particular value forever. The policy goes
-- back to doing one job: pinning ownership.
--
-- NOTE: the revokes below are a no-op - see the next migration. anon and
-- authenticated hold table-level INSERT/UPDATE, which implies every column, so
-- revoking a column privilege that was never separately granted changes
-- nothing. Kept because it is already recorded in the migration history.
revoke insert (id, state, active, is_visible, date_posted, date_updated,
               source, lat, lng, geo_status, synced_at, featured)
  on public.hackathons from authenticated;

revoke update (id, state, active, is_visible, date_posted, date_updated,
               source, lat, lng, geo_status, synced_at, featured,
               origin, submitted_by)
  on public.hackathons from authenticated;

drop policy if exists "insert own submissions" on public.hackathons;
create policy "insert own submissions"
  on public.hackathons for insert
  to authenticated
  with check (
    origin = 'user'
    and submitted_by = (select auth.jwt()) ->> 'sub'
  );

drop policy if exists "update own submissions" on public.hackathons;
create policy "update own submissions"
  on public.hackathons for update
  to authenticated
  using (origin = 'user' and submitted_by = (select auth.jwt()) ->> 'sub')
  with check (origin = 'user' and submitted_by = (select auth.jwt()) ->> 'sub');
