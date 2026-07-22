-- supabase/migrations/20260722142728_revoke_rls_auto_enable_execute.sql
-- rls_auto_enable() is an event trigger. Event-trigger functions cannot be
-- meaningfully invoked over RPC, so exposure is low — but it is SECURITY
-- DEFINER and needs no caller, so revoke it rather than leave it reachable.

do $$
begin
  if exists (select 1 from pg_proc
             where proname = 'rls_auto_enable'
               and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
