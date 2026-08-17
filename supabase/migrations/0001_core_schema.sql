-- ============================================================
-- Daybook core schema
-- categories, tasks, day_snapshots, user_settings + RLS
--
-- There is deliberately no `status` column. All three states are derived:
--   completed   = completed_at is not null
--   carried     = carried_over_count > 0
--   pending     = neither
-- ============================================================

-- ---------- categories ----------
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  slug       text not null,
  colour     text not null default '#64748b',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists categories_user_idx on categories (user_id, sort_order);

-- ---------- tasks ----------
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  text               text not null,
  created_date       date not null,          -- when first written down, immutable
  scheduled_date     date not null,          -- which day it lives on, mutable, may be future
  completed_at       timestamptz,            -- null means not done
  energy             text check (energy in ('quick','deep')),
  category_id        uuid references categories on delete set null,
  reminder_at        timestamptz,
  carried_over_count int not null default 0, -- automatic rollover only
  reschedule_count   int not null default 0, -- manual pushes only
  created_at         timestamptz not null default now()
);

create index if not exists tasks_open_idx
  on tasks (user_id, scheduled_date) where completed_at is null;

create index if not exists tasks_day_idx
  on tasks (user_id, scheduled_date);

-- ---------- day_snapshots ----------
-- Without this, a task that rolls for three days only ever exists on day
-- three and the incomplete side of history is lost. The calendar heat map
-- reads from here rather than aggregating tasks.
create table if not exists day_snapshots (
  user_id          uuid not null references auth.users on delete cascade,
  date             date not null,
  completed_count  int not null,
  carried_count    int not null,
  carried_task_ids uuid[] not null default '{}',
  primary key (user_id, date)
);

-- ---------- user_settings ----------
create table if not exists user_settings (
  user_id           uuid primary key references auth.users on delete cascade,
  timezone          text not null default 'Australia/Sydney',
  digest_enabled    boolean not null default false,
  digest_send_at    time not null default '07:00',
  push_subscription jsonb,
  seeded_at         timestamptz,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- Row Level Security. Every table, every verb, owner only.
-- ============================================================
alter table categories    enable row level security;
alter table tasks         enable row level security;
alter table day_snapshots enable row level security;
alter table user_settings enable row level security;

drop policy if exists categories_owner on categories;
create policy categories_owner on categories
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists day_snapshots_owner on day_snapshots;
create policy day_snapshots_owner on day_snapshots
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_settings_owner on user_settings;
create policy user_settings_owner on user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
