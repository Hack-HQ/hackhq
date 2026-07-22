-- supabase/migrations/20260722000000_baseline_hackathons.sql
-- Captures the hand-created schema as it stood on 2026-07-22 so later
-- migrations have a known starting point. Idempotent: safe to re-run.

create table if not exists public.hackathons (
  id            uuid primary key,
  host          text not null,
  title         text not null,
  url           text not null,
  locations     text[] not null default '{}'::text[],
  format        text,
  prize         text,
  state         text,
  active        boolean default true,
  is_visible    boolean default true,
  date_posted   bigint,
  date_updated  bigint,
  source        text,
  lat           double precision,
  lng           double precision,
  geo_status    text,
  synced_at     timestamptz default now(),
  deadline      date,
  featured      boolean default false,
  "startDate"   date,
  "endDate"     date
);

alter table public.hackathons enable row level security;
