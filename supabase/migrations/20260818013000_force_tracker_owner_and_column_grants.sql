-- supabase/migrations/20260818013000_force_tracker_owner_and_column_grants.sql
-- NOT YET APPLIED at time of writing. Like 20260725154500 and 20260810064325,
-- this project has no Supabase CLI or MCP, so the file is applied by hand
-- through the dashboard SQL Editor; see docs/runbooks/apply-migration.md. The
-- timestamp prefix is therefore a placeholder, not a recorded version.
--
-- Prerequisite for the token-mode flip (#235). Service-role mode currently masks
-- everything below: `service_role` bypasses RLS, so no policy on
-- public.user_hackathons is consulted today and no column grant on it binds.
-- The moment SUPABASE_ANON_KEY is set, all of it becomes load-bearing at once,
-- which is the wrong time to discover a gap. Two gaps are closed here.
--
--
-- 1. 20260725154500 claimed of `user_id`'s `default auth.jwt() ->> 'sub'` that
--    "a caller cannot write a row owned by someone else even before the
--    policies below are consulted". That is not true, and the reason is the
--    same one 20260722163257 hit on public.hackathons: a DEFAULT is only
--    consulted when the column is OMITTED, while that migration's
--    `grant select, insert, update, delete on public.user_hackathons to
--    authenticated` is TABLE level, which implies every column. A caller naming
--    `user_id` explicitly never reaches the default. The claim is quoted and
--    corrected in that file's own NOTE header - cited by name rather than by
--    line, because the correction moved every line number in it.
--
--    What actually stops the write today is the `with check` on the
--    "insert own tracker" and "update own tracker" policies - verified, not
--    assumed: under token
--    mode a forged `user_id` fails with "new row violates row-level security
--    policy for table user_hackathons". So the claim is wrong about the
--    mechanism, and the consequence is that the policies are a single point of
--    failure. Loosen one and mis-owned rows become writable with nothing behind
--    it.
--
--    A BEFORE ROW trigger is the layer that removes the single point of failure,
--    because RLS `with check` is evaluated against the row as the trigger leaves
--    it (confirmed on PostgreSQL 18.4: a trigger that rewrote `user_id` turned a
--    policy violation into an accepted row). This trigger deliberately does NOT
--    rewrite. Silently correcting a forged owner would hide a client bug or an
--    attack behind a success response, and would also throw away the loud
--    failure the policies already give. It raises instead, so the refusal
--    reaches lib/tracker-store.ts, then Sentry via the /api/tracker error path.
--
--    Scope, stated plainly so nobody over-reads it: the trigger keys on the
--    request's JWT, and `service_role` carries none, so in service mode it is a
--    no-op and the cross-tenant boundary remains the four `.eq("user_id", ...)`
--    sites in lib/tracker-store.ts. That is #235, and it is the reason the flip
--    matters rather than an argument against this trigger.
--
--
-- 2. Column-level write grants, mirroring what 20260722163257 did for
--    public.hackathons. `user_id` stops being UPDATE-grantable at all, so a row
--    cannot be re-owned even by a caller whose own claim would satisfy the
--    policy - the same reasoning as withholding UPDATE on `submitted_by`
--    (`20260722163257:28-29`). `created_at` stops being writable in either
--    direction: nothing in the app sets it, so it has no business being
--    forgeable.

-- ---------------------------------------------------------------------------
-- 1. Force the owner, or refuse.
-- ---------------------------------------------------------------------------

create or replace function public.force_tracker_owner()
  returns trigger
  language plpgsql
  -- SECURITY INVOKER: the function must see the caller's own JWT, and it needs
  -- no privilege the caller lacks. `search_path = ''` for the same reason every
  -- other function here pins it - a trigger must not resolve names through
  -- whatever the caller happens to have set.
  security invoker
  set search_path = ''
as $$
declare
  claim_sub text;
begin
  claim_sub := nullif(auth.jwt() ->> 'sub', '');

  -- No JWT: the sync, psql, or a server-side service-role client. There is no
  -- claim to compare against, so this trigger has nothing to say. Returning NEW
  -- unchanged is required, not lenient - `user_id` is NOT NULL, and blanking it
  -- would break the one path that legitimately supplies its own owner.
  if claim_sub is null then
    return new;
  end if;

  -- Column omitted, or explicitly null: this is the case the DEFAULT was
  -- supposed to cover. Fill it, so 20260725154500's claim is finally
  -- true of some layer.
  if new.user_id is null then
    new.user_id := claim_sub;
    return new;
  end if;

  -- Named, and not the caller's own. Refuse loudly. 42501 insufficient_privilege
  -- rather than a check violation: this is an authorization failure, and the
  -- SQLSTATE is what tells lib/tracker-errors.ts to keep it a 500 rather than
  -- classifying it as the transient schema-drift condition.
  if new.user_id <> claim_sub then
    raise exception
      'user_hackathons.user_id must match the caller''s JWT subject'
      using errcode = '42501',
            hint = 'Omit user_id and let the database supply it.';
  end if;

  return new;
end
$$;

comment on function public.force_tracker_owner() is
  'BEFORE INSERT OR UPDATE on user_hackathons: fills user_id from the JWT sub, '
  'refuses a mismatch. No-op without a JWT (service_role, psql).';

-- A trigger function has no caller, so nothing may execute it directly. Both
-- forms are issued together because that is the lesson of 20260722192614:16-19 -
-- a new function gets EXECUTE from PUBLIC by Postgres default AND from
-- anon/authenticated via Supabase's ALTER DEFAULT PRIVILEGES, and revoking
-- either alone reports success while changing nothing.
revoke execute on function public.force_tracker_owner() from public;
revoke execute on function public.force_tracker_owner() from anon, authenticated;

drop trigger if exists user_hackathons_force_owner on public.user_hackathons;

create trigger user_hackathons_force_owner
  before insert or update on public.user_hackathons
  for each row execute function public.force_tracker_owner();

-- ---------------------------------------------------------------------------
-- 2. Column-level write grants.
-- ---------------------------------------------------------------------------

-- Table-level INSERT/UPDATE implies every column, so it has to go before a
-- narrower grant means anything. Same shape as 20260722163257:15-17.
revoke insert, update on public.user_hackathons from authenticated;

-- INSERT: `user_id` stays grantable because lib/tracker-store.ts names it
-- explicitly on the import path (`user_id: userId`, with
-- `onConflict: "user_id,hackathon_id"`), and public.upsert_tracker_row names it
-- in its own insert column list. Withholding it would break both under token
-- mode. The trigger above is what makes naming it safe. `updated_at` stays for
-- the same concrete reason: 20260810064325 writes it on insert and sets it in
-- the ON CONFLICT branch, under SECURITY INVOKER, so the privilege is checked
-- against the caller.
grant insert (user_id, hackathon_id, stage, is_win, updated_at)
  on public.user_hackathons to authenticated;

-- UPDATE: only the three columns an update legitimately moves. `user_id` and
-- `hackathon_id` are absent so a row can never be re-owned or re-pointed -
-- they identify the row, they are not payload. `created_at` is absent from both
-- lists: no code path writes it.
grant update (stage, is_win, updated_at)
  on public.user_hackathons to authenticated;

-- SELECT is deliberately left table-wide. Every column is the caller's own data
-- and the read policy already restricts which rows they are, so there is no
-- column here to withhold - unlike public.hackathons, where `submitted_by`
-- exposes other people.

-- ---------------------------------------------------------------------------
-- Verification. Run these after applying; each must return the stated result.
-- ---------------------------------------------------------------------------
--
--   -- the trigger exists and fires BEFORE, on both events
--   select tgname, tgtype from pg_trigger
--   where tgrelid = 'public.user_hackathons'::regclass and not tgisinternal;
--   -- expect user_hackathons_force_owner, tgtype 23
--   --   = ROW(1) | BEFORE(2) | INSERT(4) | UPDATE(16)
--
--   -- nobody can call the trigger function directly
--   select coalesce(proacl::text, '(default: PUBLIC has EXECUTE)')
--   from pg_proc where proname = 'force_tracker_owner';
--   -- expect {postgres=X/postgres}; no leading '=X/' PUBLIC entry, and neither
--   -- anon nor authenticated present
--
--   -- authenticated holds column-level writes, not table-level
--   select column_name, privilege_type from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'user_hackathons'
--     and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE')
--   order by privilege_type, column_name;
--   -- expect INSERT: hackathon_id, is_win, stage, updated_at, user_id
--   --        UPDATE: is_win, stage, updated_at
--
-- rollback:
--   drop trigger if exists user_hackathons_force_owner on public.user_hackathons;
--   drop function if exists public.force_tracker_owner();
--   revoke insert, update on public.user_hackathons from authenticated;
--   grant insert, update on public.user_hackathons to authenticated;
--   -- Restores 20260725154500's table-level grants. Destructive in the sense
--   -- that it reopens the forgeable-owner gap; it exists so the apply is
--   -- reversible in one paste, not because it should ever be run.
