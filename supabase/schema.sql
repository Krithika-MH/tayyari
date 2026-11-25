-- Tayyari Postgres Schema for Supabase
-- Run in Supabase SQL Editor.
-- Defense in depth: RLS is enabled on every table with no public policies;
-- all access happens strictly through Next.js server route handlers using SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('wedding', 'engagement', 'birthday', 'festival', 'housewarming', 'other')),
  city text not null,
  area text not null default '',
  event_date date not null,
  language text not null default 'en-IN' check (language in ('en-IN', 'kn-IN', 'hi-IN')),
  guest_count integer not null check (guest_count > 0),
  total_budget_inr integer not null check (total_budget_inr >= 0),
  plan text not null default 'free' check (plan in ('free', 'pass')),
  pass_expires_at timestamptz null,
  is_demo boolean not null default false
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('organizer', 'decision_owner', 'helper', 'viewer')),
  can_see_amounts boolean not null default false,
  access_token text not null unique,
  preferred_language text not null default 'en-IN' check (preferred_language in ('en-IN', 'kn-IN', 'hi-IN'))
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  allocated_inr integer not null check (allocated_inr >= 0),
  sort integer not null default 0
);

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null,
  name text not null,
  phone text null,
  address text not null,
  rating numeric null,
  user_rating_count integer null,
  maps_url text not null,
  place_id text not null,
  shortlisted boolean not null default true,
  source text not null default 'places' check (source in ('places', 'sample')),
  fetched_at timestamptz not null default now(),
  unique (event_id, place_id)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  title text not null,
  vendor_id uuid null references vendors(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_inr integer null check (unit_price_inr is null or unit_price_inr >= 0),
  committed_inr integer not null default 0 check (committed_inr >= 0),
  paid_inr integer not null default 0 check (paid_inr >= 0),
  status text not null default 'estimate' check (status in ('estimate', 'quoted', 'committed', 'paid')),
  vendor_confirmation text not null default 'not_applicable' check (vendor_confirmation in ('not_applicable', 'pending', 'acknowledged')),
  source text not null default 'user_quote' check (source in ('user_quote', 'demo_data', 'estimate')),
  quote_date date null,
  version integer not null default 1,
  note text not null default ''
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  owner_id uuid null references members(id) on delete set null,
  due_date date not null,
  status text not null default 'assigned' check (status in ('assigned', 'accepted', 'completed', 'declined')),
  depends_on uuid null references tasks(id) on delete set null,
  source text not null default 'template' check (source in ('template', 'user', 'agent', 'proposal')),
  time_label text null,
  location_label text null
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  amount_inr integer not null check (amount_inr >= 0),
  unit_label text not null default 'total',
  inclusions text not null default '',
  exclusions text not null default '',
  valid_till date null,
  entered_by uuid null references members(id) on delete set null,
  quote_date date not null default current_date
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  baseline_version integer not null,
  baseline_unit_price_inr integer null,
  field text not null default 'quantity',
  previous_value integer not null,
  requested_value integer not null,
  requested_by uuid null references members(id) on delete set null,
  source_text text not null,
  source_language text not null default 'en-IN',
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'rejected',
    'expired', 'stale', 'failed_to_dispatch', 'needs_discussion'
  )),
  decision_owner_id uuid null references members(id) on delete set null,
  task_owner_id uuid null references members(id) on delete set null,
  impact jsonb not null default '{}'::jsonb,
  workflow_ref text null,
  idempotency_keys text[] not null default '{}',
  history jsonb not null default '[]'::jsonb
);

create table if not exists leftovers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  food_type text not null,
  approx_portions integer not null check (approx_portions > 0),
  served_at text not null,
  storage_notes text not null default 'unknown',
  allergen_notes text null,
  pickup_location text not null,
  ngo_place_id text null,
  ngo_name text null,
  ngo_phone text null,
  ngo_maps_url text null,
  status text not null default 'logged' check (status in (
    'logged', 'outreach_pending_approval', 'outreach_approved',
    'contacted', 'accepted', 'declined', 'collected', 'not_collected'
  )),
  workflow_ref text null,
  idempotency_keys text[] not null default '{}',
  history jsonb not null default '[]'::jsonb
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  to_type text not null check (to_type in ('vendor', 'relative', 'helper', 'ngo')),
  to_name text not null,
  purpose text not null,
  language text not null check (language in ('en-IN', 'kn-IN', 'hi-IN')),
  body text not null,
  status text not null default 'prepared' check (status in ('prepared', 'copied', 'shared')),
  created_by uuid null references members(id) on delete set null
);

create table if not exists agent_turns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_name text null,
  tool_args jsonb null,
  tool_result jsonb null,
  pending_action jsonb null,
  action_status text not null default 'none' check (action_status in ('none', 'pending', 'confirmed', 'dismissed'))
);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  actor_id uuid null references members(id) on delete set null,
  kind text not null,
  summary text not null,
  ref_id uuid null
);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  group_label text not null default 'Family',
  count integer not null default 1 check (count > 0),
  dietary_note text not null default '',
  rsvp text not null default 'unknown' check (rsvp in ('unknown', 'yes', 'no'))
);

create table if not exists place_cache (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  query_key text not null unique,
  results jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create table if not exists usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('speech', 'agent', 'search', 'leftover')),
  day date not null default current_date,
  count integer not null default 0 check (count >= 0),
  unique (event_id, kind, day)
);

-- Indexes on (event_id, created_at) for every list table
create index if not exists idx_members_event_created on members(event_id, created_at);
create index if not exists idx_categories_event_created on categories(event_id, created_at);
create index if not exists idx_vendors_event_created on vendors(event_id, created_at);
create index if not exists idx_expenses_event_created on expenses(event_id, created_at);
create index if not exists idx_tasks_event_created on tasks(event_id, created_at);
create index if not exists idx_quotes_event_created on quotes(event_id, created_at);
create index if not exists idx_proposals_event_created on proposals(event_id, created_at);
create index if not exists idx_leftovers_event_created on leftovers(event_id, created_at);
create index if not exists idx_messages_event_created on messages(event_id, created_at);
create index if not exists idx_agent_turns_event_created on agent_turns(event_id, created_at);
create index if not exists idx_activity_event_created on activity(event_id, created_at);
create index if not exists idx_guests_event_created on guests(event_id, created_at);
create index if not exists idx_usage_event_created on usage(event_id, created_at);

-- Enable Row Level Security on every table (no public policies)
alter table events enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table vendors enable row level security;
alter table expenses enable row level security;
alter table tasks enable row level security;
alter table quotes enable row level security;
alter table proposals enable row level security;
alter table leftovers enable row level security;
alter table messages enable row level security;
alter table agent_turns enable row level security;
alter table activity enable row level security;
alter table guests enable row level security;
alter table place_cache enable row level security;
alter table usage enable row level security;
