-- Peakhour sync schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Every row belongs to the signed-in user (row level security).
-- `client_updated_at` (ms since epoch, set by the device) decides conflicts: last write wins.
-- `updated_at` (server clock) is the pull cursor. Deletes are soft (`deleted = true`) so they sync.

create table if not exists public.projects (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text,
  color text,
  archived boolean default false,
  weekly_goal_hours numeric,
  created_at timestamptz,
  client_updated_at bigint not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.sessions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  project_id text,
  start_at timestamptz,
  end_at timestamptz,
  paused_ms bigint default 0,
  rating smallint,
  rating_kind text,
  comment text,
  tz_offset smallint,
  client_updated_at bigint not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- the running timer (one row, id = 'active'), so you can start on one device and stop on another
create table if not exists public.timers (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  project_id text,
  start_at timestamptz,
  paused_at timestamptz,
  paused_ms bigint default 0,
  end_at timestamptz,
  client_updated_at bigint not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'sessions', 'timers'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_cursor', t);
  end loop;
end $$;

-- Analysis-friendly view: one row per live session, net minutes, local wall-clock time.
create or replace view public.session_stats with (security_invoker = true) as
select
  s.id,
  p.name as project,
  (s.start_at at time zone 'UTC') + make_interval(mins => s.tz_offset) as local_start,
  (s.end_at at time zone 'UTC') + make_interval(mins => s.tz_offset) as local_end,
  round(((extract(epoch from s.end_at - s.start_at) * 1000 - coalesce(s.paused_ms, 0)) / 60000)::numeric, 1) as net_minutes,
  round((coalesce(s.paused_ms, 0) / 60000.0)::numeric, 1) as paused_minutes,
  s.rating,
  s.rating_kind,
  s.comment,
  s.user_id
from public.sessions s
left join public.projects p on p.user_id = s.user_id and p.id = s.project_id
where not s.deleted;
