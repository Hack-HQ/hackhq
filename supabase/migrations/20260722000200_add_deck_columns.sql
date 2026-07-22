-- supabase/migrations/20260722000200_add_deck_columns.sql
-- Columns for the deck redesign. `origin` is the conflict rule between the two
-- write paths: the listings.json sync only ever touches its own rows, so a
-- user submission can never be clobbered by the next automation run.

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
