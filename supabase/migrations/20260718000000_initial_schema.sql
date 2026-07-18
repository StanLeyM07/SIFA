-- SIFA initial schema
--
-- Mirrors the shapes in app/src/frontend/src/lib/sifa/types.ts.
-- Every user-owned table carries user_id and is protected by RLS, so data
-- isolation is enforced by Postgres rather than by application code.

-- ── Profiles ─────────────────────────────────────────────────
-- One row per auth user. `tier` exists so monetisation later is a column
-- update rather than a migration; while the app is free everyone is on the
-- top tier and nothing reads it for gating.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  tier       text not null default 'business'
             check (tier in ('starter', 'pro', 'business')),
  created_at timestamptz not null default now()
);

-- ── Transactions ─────────────────────────────────────────────
-- amount is always positive; direction lives in `type`, matching the frontend.
-- `normalized` is the output of categorize/normalize.ts — stored so imports
-- can spot likely duplicates and so corrections key off the same value.
create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  description text not null,
  category    text not null,
  amount      numeric(14, 2) not null check (amount >= 0),
  type        text not null check (type in ('income', 'expense')),
  normalized  text,
  created_at  timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_user_normalized_idx on public.transactions (user_id, normalized);

-- Deliberately NOT unique. Two identical coffees on the same day are a real
-- transaction pair, not a duplicate import — so re-import detection is a
-- warning in the review screen, where the user can decide, rather than a
-- constraint that silently rejects valid rows.

-- ── Goals ────────────────────────────────────────────────────
create table public.goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  name                 text not null,
  target               numeric(14, 2) not null check (target >= 0),
  current              numeric(14, 2) not null default 0 check (current >= 0),
  monthly_contribution numeric(14, 2) not null default 0 check (monthly_contribution >= 0),
  created_at           timestamptz not null default now()
);

create index goals_user_idx on public.goals (user_id);

-- ── Bills ────────────────────────────────────────────────────
create table public.bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  amount       numeric(14, 2) not null check (amount >= 0),
  category     text not null,
  due_date     date not null,
  status       text not null default 'pending' check (status in ('pending', 'paid')),
  is_recurring boolean not null default false,
  created_at   timestamptz not null default now()
);

create index bills_user_due_idx on public.bills (user_id, due_date);

-- ── Invoices ─────────────────────────────────────────────────
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  amount       numeric(14, 2) not null check (amount >= 0),
  category     text not null,
  due_date     date not null,
  status       text not null default 'pending' check (status in ('pending', 'paid')),
  is_recurring boolean not null default false,
  created_at   timestamptz not null default now()
);

create index invoices_user_due_idx on public.invoices (user_id, due_date);

-- ── Dashboard widgets ────────────────────────────────────────
-- data_source has no check constraint on purpose: the WidgetDataSource union
-- in types.ts is currently out of sync with the renderer (the v2 sources are
-- referenced but never added to the type). Pinning it here would just move
-- that inconsistency into the database.
create table public.widgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  type            text not null check (type in ('metricCard', 'barChart', 'pieChart')),
  title           text not null,
  data_source     text not null,
  category_filter text,
  time_range      text not null default 'this_month'
                  check (time_range in ('this_month', 'last_month', 'ytd', 'all_time')),
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);

create index widgets_user_idx on public.widgets (user_id, position);

-- ── Learned merchant rules ───────────────────────────────────
-- The user's own import corrections, synced so they follow them across
-- devices. Natural key on (user_id, normalized) makes correction writes a
-- plain upsert.
create table public.merchant_rules (
  user_id    uuid not null references auth.users (id) on delete cascade,
  normalized text not null,
  category   text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, normalized)
);

-- ── Row level security ───────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.transactions   enable row level security;
alter table public.goals          enable row level security;
alter table public.bills          enable row level security;
alter table public.invoices       enable row level security;
alter table public.widgets        enable row level security;
alter table public.merchant_rules enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bills" on public.bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own invoices" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own widgets" on public.widgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own merchant rules" on public.merchant_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Profile bootstrap ────────────────────────────────────────
-- Create the profile row automatically on signup so the app never has to
-- handle a logged-in user without one.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
