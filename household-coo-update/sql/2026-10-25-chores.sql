-- Household COO: chore system. Run once in the Supabase SQL editor for the Household COO project.
-- Adds chore fields to tasks, a bucket for proof photos, a table for phone reminder sign-ups,
-- and an hourly job that asks the app to send overdue reminders.

-- 1. Chore fields on tasks
alter table public.tasks
  add column if not exists steps text,
  add column if not exists proof_hint text,
  add column if not exists due_at timestamptz,
  add column if not exists repeat text default 'none',
  add column if not exists photo_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists redo_note text,
  add column if not exists reminders jsonb default '{}'::jsonb;

-- 2. Proof photos. Private bucket; household members read, members upload their own, parents delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chore-photos', 'chore-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "chore photos read" on storage.objects;
create policy "chore photos read" on storage.objects for select to authenticated
  using (bucket_id = 'chore-photos' and exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id::text = split_part(name, '/', 1)));

drop policy if exists "chore photos upload" on storage.objects;
create policy "chore photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chore-photos' and exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id::text = split_part(name, '/', 1)));

drop policy if exists "chore photos delete" on storage.objects;
create policy "chore photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chore-photos' and exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.role in ('owner','adult') and m.household_id::text = split_part(name, '/', 1)));

-- 3. Phone reminder sign-ups (one row per device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Hourly reminder job (already run on Oct 25 2026). Replace CRON_SECRET_HERE with the CRON_SECRET value from Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'coo-chore-reminders';
select cron.schedule('coo-chore-reminders', '0 * * * *', $$
  select net.http_post(
    url := 'https://app.provisionhouse.org/api/push',
    headers := '{"content-type":"application/json","x-cron-secret":"CRON_SECRET_HERE"}'::jsonb,
    body := '{"mode":"cron"}'::jsonb);
$$);
