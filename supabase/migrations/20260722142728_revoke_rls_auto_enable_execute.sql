-- supabase/migrations/20260722142728_revoke_rls_auto_enable_execute.sql
-- NOTE: this file's executable SQL differs from the statement recorded in
-- supabase_migrations.schema_migrations. What ran was a bare
-- `revoke execute on function public.rls_auto_enable() from anon, authenticated;`.
-- rls_auto_enable() is inherited from the hosting project rather than created
-- here (see the baseline), so that statement errors on any database that does
-- not already have it and stops the chain dead. The `if exists` guard below
-- makes a replay possible. Applied statements are immutable, so the recorded
-- text stays as it was; this file is the one that has to be replayable.
--
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
