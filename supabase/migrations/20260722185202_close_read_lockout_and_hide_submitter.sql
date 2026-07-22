-- supabase/migrations/20260722185202_close_read_lockout_and_hide_submitter.sql
-- Three defects found in final review.
--
-- 1. The lockout had a second door. The read policy was `is_visible = true`
--    alone, and is_visible is not update-grantable to the submitter. PostgREST
--    issues UPDATE/DELETE with a filter, which needs SELECT, so hiding a user's
--    row stripped its owner of read, edit AND delete on their own submission -
--    the same silent, permanent loss of control the conflict-rule trigger and
--    the earlier WITH CHECK fix were both meant to prevent.
--    An owner now always sees their own row, visible or not.
drop policy if exists "read visible hackathons" on public.hackathons;
create policy "read visible hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (
    is_visible = true
    or (origin = 'user' and submitted_by = (select auth.jwt()) ->> 'sub')
  );

-- 2. anon could read submitted_by - the submitter's Clerk user id - so anyone
--    holding the publishable anon key could enumerate and correlate submitters.
--    Writes were narrowed column by column; reads never were.
--    `source` stays readable: it is a GitHub username already published in
--    listings.json and the README, i.e. already public contribution data.
revoke select on public.hackathons from anon;
grant select (id, host, title, url, locations, format, prize, state, active,
              is_visible, date_posted, date_updated, source, lat, lng,
              geo_status, synced_at, deadline, featured, "startDate", "endDate",
              origin, description, logo_url, host_type)
  on public.hackathons to anon;

-- 3. skip_sync_over_user_rows() was left EXECUTE-able by PUBLIC - exactly the
--    exposure two earlier migrations closed on rls_auto_enable(). Same
--    treatment, for the same reason: a trigger function needs no caller.
--    NOTE: this particular revoke was a no-op; see the next migration.
revoke execute on function public.skip_sync_over_user_rows() from public;
