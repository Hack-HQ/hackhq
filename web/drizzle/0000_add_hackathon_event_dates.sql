alter table public.hackathons
  add column if not exists "startDate" date,
  add column if not exists "endDate" date;
