-- Run once in your Supabase project's SQL editor. No service-role key is used
-- by the app: authenticated users can read and change only their own row.
begin;
create table if not exists public.planner_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'format' = '1'),
  updated_at timestamptz not null default now()
);
alter table public.planner_workspaces enable row level security;
-- New tables may inherit broader default grants. RLS does not cover TRUNCATE.
revoke all on public.planner_workspaces from PUBLIC, anon, authenticated;
grant select, insert, update on public.planner_workspaces to authenticated;
drop policy if exists "Read own workspace" on public.planner_workspaces;
create policy "Read own workspace" on public.planner_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Create own workspace" on public.planner_workspaces;
create policy "Create own workspace" on public.planner_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own workspace" on public.planner_workspaces;
create policy "Update own workspace" on public.planner_workspaces for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
