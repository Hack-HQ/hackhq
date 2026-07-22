-- supabase/migrations/20260722160812_revoke_ddl_privileges_from_api_roles.sql
-- anon and authenticated hold TRUNCATE, REFERENCES and TRIGGER on this table,
-- inherited from Supabase's stock `grant all on all tables in schema public`
-- bootstrap. None of the three is needed by an API role, and critically:
--
--   RLS does not apply to TRUNCATE.
--
-- So while INSERT/UPDATE/DELETE are genuinely gated by the policies, a TRUNCATE
-- grant sits outside that protection entirely. Reachability today is nil -
-- PostgREST exposes no truncate verb and anon is not a login role - but this is
-- the one privilege on the table that no policy can defend.
--
-- SELECT, INSERT, UPDATE and DELETE are deliberately left in place: the policies
-- are what constrain them, and the write flow needs them.
revoke truncate, references, trigger
  on public.hackathons
  from anon, authenticated;
