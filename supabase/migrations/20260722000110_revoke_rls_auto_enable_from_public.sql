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
