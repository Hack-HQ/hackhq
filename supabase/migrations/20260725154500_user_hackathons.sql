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
-- public.hackathons. `default auth.jwt() ->> 'sub'` fills it only when the
-- client omits the column — that is the only case a DEFAULT is ever consulted —
-- so it is a convenience, NOT an ownership control. What refuses a row owned by
-- someone else is the `with check` on the "insert own tracker" and "update own
-- tracker" policies below and, since 20260818013000, the BEFORE INSERT OR UPDATE
-- trigger `public.force_tracker_owner` that runs ahead of them — for callers who
-- carry a JWT at all. See the NOTE at the end of this header.
--
-- Deliberately NO foreign key to public.hackathons. That table is a mirror the
-- hourly sync can leave up to an hour behind .github/scripts/listings.json,
-- which is what the app actually renders from — an FK would reject a save for
-- any listing added since the last sync. The id is validated in the app layer
-- against the live listing set instead.
--
-- NOTE: the paragraph above used to read "It defaults from the JWT rather than
-- being sent by the client, so a caller cannot write a row owned by someone else
-- even before the policies below are consulted." That was wrong about the
-- mechanism. A DEFAULT is consulted only when the column is OMITTED, and the
-- `grant select, insert, update, delete ... to authenticated` below is a TABLE
-- level grant, which implies every column — so a caller who names `user_id`
-- explicitly never reaches the default and writes whatever it sent. Verified
-- under token mode rather than reasoned about: the only thing that actually
-- refused a forged owner was the `with check` on the insert and update policies,
-- which fails the write with "new row violates row-level security policy for
-- table user_hackathons". So the policies were not the second line of defence
-- this comment implied they were behind — they were the single point of failure.
-- Loosen one and mis-owned rows become writable with nothing behind it.
--
-- 20260818013000_force_tracker_owner_and_column_grants.sql adds the pre-policy
-- layer the old comment claimed already existed: a BEFORE INSERT OR UPDATE
-- trigger (`public.force_tracker_owner`) that fills `user_id` when it is omitted
-- or null and raises SQLSTATE 42501 on a mismatch rather than silently
-- rewriting it, plus column-level write grants that drop `user_id` from the
-- UPDATE list entirely, so an existing row cannot be re-owned at all. Read that
-- exactly as narrowly as it is written: the trigger keys on the request's JWT,
-- and `service_role` and `postgres` carry none, so for those roles it is a
-- no-op. In service-role mode — how the app runs today — the cross-tenant
-- boundary is still the four `.eq("user_id", ...)` filters in
-- web/lib/tracker-store.ts (#235), not the database.
--
-- That correction lives only in this file, and unlike the comparable note in
-- 20260722144205_add_deck_columns.sql there is no recorded statement here for it
-- to diverge from: this migration was hand-applied through the SQL Editor (see
-- the top of this header), so `supabase_migrations.schema_migrations` holds
-- nothing for it and this file is the only artefact. The SQL below is unchanged.

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
