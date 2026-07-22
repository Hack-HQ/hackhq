-- supabase/migrations/20260722145817_rls_policies.sql
-- Read: both roles. The old policy named only `anon`, so a signed-in visitor
-- would have seen an empty board the moment Clerk auth landed.
-- Write: authenticated users, only their own rows, and never a synced row.

drop policy if exists "public read" on public.hackathons;

create policy "read visible hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (is_visible = true);

drop policy if exists "insert own submissions" on public.hackathons;

create policy "insert own submissions"
  on public.hackathons for insert
  to authenticated
  with check (
    origin = 'user'
    and submitted_by = auth.jwt() ->> 'sub'
  );

drop policy if exists "update own submissions" on public.hackathons;

create policy "update own submissions"
  on public.hackathons for update
  to authenticated
  using (origin = 'user' and submitted_by = auth.jwt() ->> 'sub')
  with check (origin = 'user' and submitted_by = auth.jwt() ->> 'sub');

drop policy if exists "delete own submissions" on public.hackathons;

create policy "delete own submissions"
  on public.hackathons for delete
  to authenticated
  using (origin = 'user' and submitted_by = auth.jwt() ->> 'sub');
