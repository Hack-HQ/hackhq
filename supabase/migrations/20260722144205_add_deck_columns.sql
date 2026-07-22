-- supabase/migrations/20260722144205_add_deck_columns.sql
-- Columns for the deck redesign. `origin` records which of the two write paths
-- produced a row - 'listings_json' for the hourly sync, 'user' for a site
-- submission - and exists to express one rule: the sync never re-owns a row a
-- user submitted.
--
-- NOTE: when this migration was written, nothing enforced that rule. upsert()
-- does not filter on origin and service_role bypasses RLS, so a user row was
-- protected only by uuid ids never colliding. That is no longer true. The
-- hackathons_skip_sync_over_user_rows BEFORE UPDATE trigger, added in
-- 20260722154046_enforce_conflict_rule.sql, discards any update that would flip
-- an origin='user' row to anything else, and no role bypasses a trigger -
-- including service_role, which is exactly why it is a trigger and not a policy.
--
-- That correction lives only in this file. The statement text recorded in
-- supabase_migrations.schema_migrations is the original and cannot be rewritten
-- there; the difference is confined to these comments, the SQL below is
-- unchanged.

alter table public.hackathons
  add column if not exists origin       text,
  add column if not exists description  text,
  add column if not exists logo_url     text,
  add column if not exists host_type    text,
  add column if not exists submitted_by text;

-- Everything that exists today arrived via the sync.
update public.hackathons set origin = 'listings_json' where origin is null;

alter table public.hackathons
  alter column origin set default 'listings_json',
  alter column origin set not null;

alter table public.hackathons
  drop constraint if exists hackathons_origin_check,
  add constraint hackathons_origin_check
    check (origin in ('listings_json', 'user'));

alter table public.hackathons
  drop constraint if exists hackathons_host_type_check,
  add constraint hackathons_host_type_check
    check (host_type is null or host_type in ('university', 'community', 'company'));

create index if not exists hackathons_origin_idx on public.hackathons (origin);
