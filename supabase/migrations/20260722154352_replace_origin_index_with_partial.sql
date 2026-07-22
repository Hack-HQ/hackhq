-- supabase/migrations/20260722154352_replace_origin_index_with_partial.sql
-- hackathons_origin_idx indexed a two-valued column on a 32-row table. The
-- planner will always prefer a sequential scan, and Supabase's linter already
-- reports it as never used.
--
-- What the submission flow actually needs is "the rows this user submitted",
-- so index that instead - partial, because user rows will stay a small
-- minority of the table for a long time.
drop index if exists public.hackathons_origin_idx;

create index if not exists hackathons_submitted_by_idx
  on public.hackathons (submitted_by)
  where origin = 'user';
