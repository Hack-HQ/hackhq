-- supabase/migrations/20260722190741_make_api_role_grants_explicit.sql
-- Everything this chain does to privileges so far is subtractive: 20260722154244
-- revokes TRUNCATE/REFERENCES/TRIGGER, 20260722163257 revokes the table-level
-- write grants and hands back a column list, 20260722185202 revokes anon's
-- SELECT and hands back a column list. Each one assumes the privilege was
-- already there, courtesy of Supabase's stock
--
--   grant all on all tables in schema public to anon, authenticated, service_role;
--
-- bootstrap - which lives in the hosting project, not in this directory. Live
-- ACL confirms the gap: authenticated=rdm, and neither that r (SELECT) nor that
-- d (DELETE) is granted by any migration here. Replay this chain onto a
-- database without the bootstrap and you get a table with a "read visible
-- hackathons" policy and a "delete own submissions" policy that no signed-in
-- user can exercise, because a policy only narrows a privilege - it never
-- confers one.
--
-- So grant them. anon is deliberately absent: 20260722185202 already made its
-- SELECT explicit as a column list (submitted_by withheld), and 20260722163257
-- already revoked its writes.
grant select on public.hackathons to authenticated;
grant delete on public.hackathons to authenticated;

-- service_role has the same hole for the same reason, and it is the role
-- seed_supabase.py authenticates as. Without these the hourly sync fails
-- outright on a bootstrap-less replay.
grant select, insert, update, delete on public.hackathons to service_role;

-- What this chain still assumes and does not create, so a replay knows what it
-- needs standing before the first migration:
--   * the anon / authenticated / service_role roles themselves;
--   * auth.jwt(), which every write policy calls;
--   * gen_random_uuid() for the id default (20260722154341);
--   * ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions to anon and
--     authenticated - the thing 20260722185256 and 20260722190603 revoke;
--   * rls_auto_enable() and the ensure_rls event trigger, already called out as
--     inherited in the baseline. The two migrations that touch it are guarded
--     with `if exists` precisely so its absence does not break the replay.
