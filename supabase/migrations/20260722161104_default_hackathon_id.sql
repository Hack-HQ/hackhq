-- supabase/migrations/20260722161104_default_hackathon_id.sql
-- id had no default, so every insert had to supply its own uuid. That is a
-- footgun for the submission flow: a client-chosen id is the only way a user
-- row's id can be made to collide with a listings.json entry's on purpose,
-- which is the collision the conflict-rule trigger exists to survive.
--
-- Defaulting it means the submission path never names an id at all.
alter table public.hackathons
  alter column id set default gen_random_uuid();
