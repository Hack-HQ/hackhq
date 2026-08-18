-- supabase/migrations/20260818014500_revoke_maintain_from_api_roles.sql
-- NOT YET APPLIED at time of writing; hand-applied through the dashboard SQL
-- Editor like 20260725154500, 20260810064325 and 20260818013000. See
-- docs/runbooks/apply-migration.md. The timestamp prefix is a placeholder, not a
-- recorded version.
--
-- Found by replaying the whole chain onto a bare PostgreSQL 18 cluster, which
-- .github/workflows/db-invariants.yml now does on every supabase/** pull
-- request. Nothing had ever actually run that replay before.
--
-- PostgreSQL 17 added a MAINTAIN table privilege (VACUUM, ANALYZE, CLUSTER,
-- REINDEX, REFRESH MATERIALIZED VIEW). Supabase's stock bootstrap is
--
--   grant all on all tables in schema public to anon, authenticated, service_role;
--
-- and `all` means whatever `all` means on the server version that ran it - so on
-- PG17+ the API roles pick MAINTAIN up. 20260722154244 revoked TRUNCATE,
-- REFERENCES and TRIGGER from them for a reason it stated plainly: RLS does not
-- apply to TRUNCATE. MAINTAIN is in exactly that class. It grants no ability to
-- read or write a row, so this is not a data-disclosure fix; what it grants is
-- the ability to make the database do expensive work on demand, which is a
-- denial-of-service surface reachable by anyone holding the publishable anon
-- key. A role that exists to serve HTTP requests has no business reindexing a
-- table.
--
-- After a replay of the chain up to this file, `hackathons` ends at `anon=m`
-- and `authenticated=dm` (d = DELETE, which 20260722190741 grants deliberately).
-- That `m` is the whole finding: no migration revokes it, so it survives.
--
-- Version-guarded because the privilege does not exist before PG17 and a bare
-- `revoke maintain` is a syntax error there. The guard keeps the chain
-- replayable on an older server, which is the same reason 20260722142728 and
-- 20260722143346 wrap their revokes in `if exists`.

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.hackathons from anon, authenticated';
    execute 'revoke maintain on public.user_hackathons from anon, authenticated';
  else
    raise notice
      'server is % - MAINTAIN does not exist before PG17, nothing to revoke',
      current_setting('server_version');
  end if;
end
$$;

-- service_role keeps MAINTAIN, as it keeps TRUNCATE (20260722154244 named only
-- anon and authenticated for the same reason): it is the trusted server-side
-- role, not an API surface a browser can reach.

-- ---------------------------------------------------------------------------
-- Verification. Run after applying; on PG17+ every row must read false.
-- ---------------------------------------------------------------------------
--
-- Use has_table_privilege, NOT information_schema. This was a real trap, caught
-- only because the pre-state was checked as well as the post-state:
-- information_schema.role_table_grants does not report MAINTAIN at all - those
-- views are defined by the SQL standard and MAINTAIN is a PostgreSQL extension -
-- so a MAINTAIN query against them returns zero rows whether the privilege is
-- held or not, and reads as a pass either way. Measured on PG 18.4: with the
-- grant in place, information_schema returned 0 rows while `relacl` showed
-- `anon=m` and `authenticated=dm`.
--
--   select r as role, t as tbl, has_table_privilege(r, t, 'MAINTAIN') as held
--   from unnest(array['anon','authenticated']) r,
--        unnest(array['public.hackathons','public.user_hackathons']) t
--   order by 1, 2;
--   -- expect held = false for all four rows
--
--   select relname, relacl from pg_class
--   where relname in ('hackathons', 'user_hackathons') order by relname;
--   -- No 'm' in any anon= or authenticated= entry. The ACL letter for MAINTAIN
--   -- is 'm'. Observed after applying, on a full replay:
--   --   hackathons      -> {postgres=arwdDxtm/postgres,authenticated=d/postgres,
--   --                       service_role=arwdDxtm/postgres}
--   --   user_hackathons -> {postgres=arwdDxtm/postgres,authenticated=rd/postgres,
--   --                       service_role=arwdDxtm/postgres}
--
-- rollback:
--   do $$
--   begin
--     if current_setting('server_version_num')::int >= 170000 then
--       execute 'grant maintain on public.hackathons to anon, authenticated';
--       execute 'grant maintain on public.user_hackathons to anon, authenticated';
--     end if;
--   end
--   $$;
--   -- Restores a DoS surface. Present so the apply is reversible in one paste,
--   -- not because it should ever be run.
