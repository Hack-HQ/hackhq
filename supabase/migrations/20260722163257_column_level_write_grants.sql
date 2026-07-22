-- supabase/migrations/20260722163257_column_level_write_grants.sql
-- The previous migration tried to revoke column-level INSERT/UPDATE, which did
-- nothing: anon and authenticated hold *table-level* INSERT/UPDATE from
-- Supabase's grant-all bootstrap, and a table-level grant implies every column.
-- Revoking a narrower privilege that was never separately granted is a no-op -
-- the same shape as revoking EXECUTE from anon when PUBLIC held it.
--
-- Do it the other way round: drop the table-level write grants, then grant back
-- only the columns a submitter has any business setting. Everything curated
-- (featured), derived (lat, lng, geo_status, state), or bookkeeping
-- (date_posted, date_updated, synced_at, source, is_visible, active) is simply
-- not grantable to them, so no policy has to defend it.

-- anon never writes. RLS already blocked it; this makes it structural.
revoke insert, update, delete on public.hackathons from anon;

revoke insert, update on public.hackathons from authenticated;

-- Insert: the submission's own fields, plus the two the insert policy requires
-- them to set. id is deliberately absent - the gen_random_uuid() default now
-- supplies it, which removes the only way to aim a user row at an existing
-- listings.json uuid.
grant insert (host, title, url, locations, format, prize, deadline,
              "startDate", "endDate", description, logo_url, host_type,
              origin, submitted_by)
  on public.hackathons to authenticated;

-- Update: the same fields minus origin and submitted_by, so a row can never be
-- re-owned or handed to another account.
grant update (host, title, url, locations, format, prize, deadline,
              "startDate", "endDate", description, logo_url, host_type)
  on public.hackathons to authenticated;
