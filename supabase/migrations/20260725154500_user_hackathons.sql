-- supabase/migrations/20260725154500_user_hackathons.sql
-- NOTE: applied by hand through the Supabase SQL Editor on 2026-07-26, because
-- this project has no Supabase CLI or MCP `apply_migration` configured. That
-- path records nothing in `supabase_migrations.schema_migrations`, so unlike
-- every other file here this timestamp is NOT a recorded version — it will not
-- appear in `list_migrations`, and `supabase db push` would try to replay it if
-- a CLI is ever wired up. See README for the divergence.
--
-- The tracker's per-user pipeline, moved off localStorage. One row per
-- (user, hackathon): which stage it sits in, and whether the user won it (#226).
--
-- `user_id` is the Clerk `sub`, matching the `submitted_by` convention on
-- public.hackathons. It defaults from the JWT rather than being sent by the
-- client, so a caller cannot write a row owned by someone else even before the
-- policies below are consulted.
--
-- Deliberately NO foreign key to public.hackathons. That table is a mirror the
-- hourly sync can leave up to an hour behind .github/scripts/listings.json,
-- which is what the app actually renders from — an FK would reject a save for
-- any listing added since the last sync. The id is validated in the app layer
-- against the live listing set instead.

create table if not exists public.user_hackathons (
  user_id      text        not null default auth.jwt() ->> 'sub',
  hackathon_id uuid        not null,
  stage        text        not null default 'interested',
  is_win       boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, hackathon_id),
  constraint user_hackathons_stage_check
    check (stage in ('interested', 'applied', 'accepted', 'going'))
);

-- `origin` on public.hackathons is text + check for the same reason: adding a
-- stage means dropping and recreating one constraint, not altering a pg enum.

comment on table public.user_hackathons is
  'Per-user hackathon tracker: pipeline stage and win flag. user_id is the Clerk sub.';

alter table public.user_hackathons enable row level security;

-- Reads and writes are the owner's only. `(select auth.jwt())` is wrapped so
-- Postgres evaluates the claim once per statement instead of once per row —
-- the unwrapped form is what Supabase's performance advisor flags.

drop policy if exists "read own tracker" on public.user_hackathons;

create policy "read own tracker"
  on public.user_hackathons for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "insert own tracker" on public.user_hackathons;

create policy "insert own tracker"
  on public.user_hackathons for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "update own tracker" on public.user_hackathons;

create policy "update own tracker"
  on public.user_hackathons for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "delete own tracker" on public.user_hackathons;

create policy "delete own tracker"
  on public.user_hackathons for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- Explicit grants, matching 20260722190741: Supabase's stock bootstrap is not
-- relied on, so a replay onto a fresh database produces a usable table.
-- `anon` gets nothing — a tracker has no public read.
grant select, insert, update, delete on public.user_hackathons to authenticated;
grant all on public.user_hackathons to service_role;

-- Supabase's stock bootstrap grants every new public table to anon and
-- authenticated via ALTER DEFAULT PRIVILEGES. A per-user tracker must not
-- inherit that, so undo it: anon gets nothing at all, and authenticated keeps
-- only the row DML the policies above gate. TRUNCATE in particular is NOT
-- subject to RLS, so it must never linger on an API role. Mirrors the intent of
-- 20260722154244 for the hackathons table.
revoke all on public.user_hackathons from anon;
revoke truncate, references, trigger on public.user_hackathons from authenticated;

-- Listing a user's tracker is the only read pattern; the primary key already
-- serves it (user_id leads), so no extra index is created here.
