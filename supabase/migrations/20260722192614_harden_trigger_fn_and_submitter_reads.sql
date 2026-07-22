-- supabase/migrations/20260722192614_harden_trigger_fn_and_submitter_reads.sql
-- Two defects, both found by independent verification of the previous pass.
--
-- 1. clear_featured_on_content_swap() was revoked from anon and authenticated
--    only, and its comment asserted that revoking from PUBLIC "would be a
--    no-op". The database disagrees:
--
--      clear_featured_on_content_swap  {=X/postgres,postgres=X,service_role=X}
--      skip_sync_over_user_rows        {postgres=X,service_role=X}
--
--    The leading `=X` is PUBLIC's grant, still present. A newly created
--    function gets EXECUTE from BOTH sources: PUBLIC by Postgres default, and
--    anon/authenticated explicitly via Supabase's ALTER DEFAULT PRIVILEGES.
--    Revoking either alone leaves the other.
--
--    This is the fourth time on this branch that a revoke targeted the wrong
--    holder and reported success while changing nothing. Both forms are issued
--    together from here on, so the question stops needing to be answered
--    correctly each time.
revoke execute on function public.clear_featured_on_content_swap() from public;
revoke execute on function public.clear_featured_on_content_swap() from anon, authenticated;

-- Belt and braces for the other two, so all three are provably identical.
revoke execute on function public.skip_sync_over_user_rows() from public;
revoke execute on function public.skip_sync_over_user_rows() from anon, authenticated;

-- 2. Hiding submitter ids from anon was only half the job: authenticated held
--    table-level SELECT, so any signed-in account could read every submitter's
--    Clerk id. Signing up is not a meaningful barrier, so this was the same
--    exposure one step further back.
--
--    RLS policy predicates are evaluated with the table owner's rights, not the
--    caller's column privileges, so "submitted_by = auth.jwt() ->> 'sub'"
--    keeps working for a role that cannot select the column.
revoke select on public.hackathons from authenticated;
grant select (id, host, title, url, locations, format, prize, state, active,
              is_visible, date_posted, date_updated, source, lat, lng,
              geo_status, synced_at, deadline, featured, "startDate", "endDate",
              origin, description, logo_url, host_type)
  on public.hackathons to authenticated;
