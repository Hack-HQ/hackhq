-- supabase/migrations/20260722143346_revoke_rls_auto_enable_from_public.sql
-- rls_auto_enable() is an event trigger. Event-trigger functions are invoked by
-- the system, not by a caller's EXECUTE privilege, so nothing needs this grant.
--
-- Revoke from PUBLIC, not from anon/authenticated: those roles hold no grant of
-- their own, they inherit PUBLIC's. Revoking from them is a no-op — an earlier
-- migration (20260722142728) tried exactly that and changed nothing.
--
-- service_role keeps its explicit grant, so server-side callers are unaffected,
-- and the function's owner (postgres) retains rights implicitly.

do $$
begin
  if exists (select 1 from pg_proc
             where proname = 'rls_auto_enable'
               and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public;
  end if;
end $$;
