-- supabase/migrations/20260722160341_enforce_conflict_rule.sql
-- The sync must never re-own a row a user submitted through the site.
--
-- A trigger, not a policy: service_role bypasses RLS, so policies cannot
-- constrain seed_supabase.py. Triggers are not bypassed by any role, so this
-- holds for the sync, the CLI, the dashboard, and any future write path.
--
-- Returns NULL rather than raising. seed_supabase.py upserts in chunks of 100;
-- an exception would fail the whole chunk instead of skipping the one row.
--
-- Why this matters beyond the overwrite itself: flipping origin to
-- 'listings_json' drops the row out of the "update own submissions" and
-- "delete own submissions" policies, which both require origin = 'user'. The
-- submitter would silently and permanently lose the ability to fix or remove
-- their own listing.
create or replace function public.skip_sync_over_user_rows()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.origin = 'user' and new.origin is distinct from 'user' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists hackathons_skip_sync_over_user_rows on public.hackathons;

create trigger hackathons_skip_sync_over_user_rows
  before update on public.hackathons
  for each row
  execute function public.skip_sync_over_user_rows();
