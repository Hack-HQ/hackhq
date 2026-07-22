-- supabase/migrations/20260722190603_clear_featured_on_content_swap.sql
-- `featured` is curation: a maintainer decides a specific listing deserves the
-- top of the deck. The column is not grantable to `authenticated`, so a
-- submitter can never set it. But nothing invalidated it afterwards, and the
-- submitter *can* update title, url, description, host and logo_url on their
-- own row. So the curation could be earned on one listing and then pointed at
-- entirely different content - a bait-and-switch that no grant or policy
-- catches, because every individual write is legitimate.
--
-- Detecting "not a service writer": current_user, not the JWT.
--
-- The sync runs as service_role and legitimately rewrites these columns every
-- hour; a maintainer curating from the dashboard or SQL editor runs as
-- postgres. PostgREST connects as `authenticator` and issues SET LOCAL ROLE
-- per request, so inside a SECURITY INVOKER trigger current_user is exactly the
-- role the request was made under - 'authenticated' for a signed-in submitter,
-- 'service_role' for the sync. auth.jwt() would be the wrong probe: it is empty
-- for the sync and for psql, so it cannot distinguish "no user" from "trusted".
--
-- The list is an allowlist rather than a denylist so it fails closed. A write
-- path added later under some new role clears featured until someone decides it
-- is trusted, which is the safe direction to be wrong in.
--
-- Only identity-defining columns count as a swap: what the featured card shows
-- and where it sends people. Correcting a deadline, prize, format, dates or
-- locations is a detail fix on the same listing and must not cost the curation,
-- or a maintainer would have to re-feature a row every time a date moves.
create or replace function public.clear_featured_on_content_swap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.featured is not true then
    return new;
  end if;

  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.url         is distinct from old.url
     or new.title    is distinct from old.title
     or new.host     is distinct from old.host
     or new.description is distinct from old.description
     or new.logo_url is distinct from old.logo_url then
    new.featured := false;
  end if;

  return new;
end;
$$;

-- Fires before hackathons_skip_sync_over_user_rows: BEFORE ROW triggers run in
-- name order, and 'c' sorts before 's'. Harmless either way - if the sync
-- trigger returns NULL the whole update is skipped and this one's edit to NEW
-- is discarded with it.
drop trigger if exists hackathons_clear_featured_on_content_swap on public.hackathons;

create trigger hackathons_clear_featured_on_content_swap
  before update on public.hackathons
  for each row
  execute function public.clear_featured_on_content_swap();

-- Same treatment as skip_sync_over_user_rows(): a trigger function needs no
-- caller, and Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon and
-- authenticated explicitly, so the roles must be named (revoking from PUBLIC
-- here would be a no-op - see 20260722185256).
revoke execute on function public.clear_featured_on_content_swap() from anon, authenticated;
