-- supabase/migrations/20260810064325_atomic_tracker_upsert.sql
-- NOT YET APPLIED. Like 20260725154500_user_hackathons.sql, this project has no
-- Supabase CLI wired up, so this file has to be run by hand through the SQL
-- Editor before the code that calls it ships. tracker-store.ts calls this
-- function; until it exists, every PUT /api/tracker fails. See #254 for the
-- wider drift between these files and the live schema.
--
-- Makes a partial tracker update atomic.
--
-- upsertTrackerRow used to read the row, merge the patch in JS, then write the
-- merged result back. That read-modify-write leaves a window: two concurrent
-- PUTs for the same (user, hackathon) both read the same snapshot, and the
-- second write clobbers the first.
--
--   A: PUT {stage:"applied"}  reads {interested, win:true} -> writes {applied,    win:true}
--   B: PUT {isWin:false}      reads {interested, win:true} -> writes {interested, win:false}
--                                                       net: A's stage change is lost
--
-- The store's contract is that "moving a hackathon between stages must not
-- clear its win, and recording a win must not reset its stage". That held
-- single-threaded and broke under concurrency — two quick clicks on different
-- controls for one hackathon is all it takes.
--
-- Collapsing the whole thing into one statement closes the window: the
-- coalesce reads the *existing* row inside the same ON CONFLICT DO UPDATE that
-- writes it, so there is nothing for a competing statement to interleave with.
-- A null argument means "leave this column alone", which is how an omitted
-- field in the patch is expressed.
--
-- security invoker, matching every other function here: today the caller is
-- service_role and RLS is bypassed either way, but once #235 moves the client
-- onto the user's Clerk token the policies on user_hackathons apply to this
-- insert/update as well. A security definer function would quietly opt out of
-- exactly the enforcement #235 is trying to gain.

create or replace function public.upsert_tracker_row(
  p_user_id      text,
  p_hackathon_id uuid,
  p_stage        text default null,
  p_is_win       boolean default null
)
returns table (stage text, is_win boolean)
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_hackathons as t (user_id, hackathon_id, stage, is_win, updated_at)
  values (
    p_user_id,
    p_hackathon_id,
    -- First insert: fall back to the same defaults the column would have used.
    coalesce(p_stage, 'interested'),
    coalesce(p_is_win, false),
    now()
  )
  on conflict (user_id, hackathon_id) do update
    set stage      = coalesce(p_stage, t.stage),
        is_win     = coalesce(p_is_win, t.is_win),
        updated_at = now()
  returning t.stage, t.is_win;
$$;

comment on function public.upsert_tracker_row(text, uuid, text, boolean) is
  'Atomic partial upsert of one tracker row. A null stage or is_win leaves that column at its stored value.';

-- Grants mirror 20260725154500: anon gets nothing, authenticated gets the call
-- (gated by the table policies once #235 lands), service_role keeps it for the
-- current server-side path. `from public` is revoked first because Postgres
-- grants EXECUTE to PUBLIC on every new function by default.
revoke execute on function public.upsert_tracker_row(text, uuid, text, boolean) from public;
revoke execute on function public.upsert_tracker_row(text, uuid, text, boolean) from anon;
grant execute on function public.upsert_tracker_row(text, uuid, text, boolean) to authenticated;
grant execute on function public.upsert_tracker_row(text, uuid, text, boolean) to service_role;
