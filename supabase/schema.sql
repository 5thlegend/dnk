-- General Dank Content Engine schema
-- run in Supabase SQL editor

create extension if not exists "pgcrypto";

-- a single capture from Discord (one /dank invocation)
create table if not exists transmissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'discord',                 -- discord | web | api
  source_user text,                                       -- discord user id
  raw_input text not null,                                -- user-supplied text/note
  ingest_summary text,                                    -- merged text after media→text
  media_refs jsonb not null default '[]'::jsonb,          -- [{type,url,transcript?}]
  status text not null default 'draft',                   -- draft | scheduled | posted | archived
  tags text[] not null default '{}',
  generation_model text,
  generation_cost_usd numeric(10,4)
);

-- one row per channel output (x_post, x_thread, reel_concept, etc.)
create table if not exists channel_outputs (
  id uuid primary key default gen_random_uuid(),
  transmission_id uuid not null references transmissions(id) on delete cascade,
  channel text not null,                                  -- x_post | x_thread | ig_caption | reel_concept | founder_transmission | deployment_log | linkedin_post | cinematic_one_liner | team_in_bio | cta_opportunity
  body jsonb not null,                                    -- string for prose, object for thread/reel
  status text not null default 'draft',                   -- draft | edited | scheduled | posted | killed
  scheduled_for timestamptz,
  posted_at timestamptz,
  performance jsonb,                                      -- {impressions, likes, replies, reposts, follows}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transmissions_created on transmissions(created_at desc);
create index if not exists idx_outputs_transmission on channel_outputs(transmission_id);
create index if not exists idx_outputs_status on channel_outputs(status);
create index if not exists idx_outputs_channel on channel_outputs(channel);

-- daily metrics rollup for the dashboard
create table if not exists daily_metrics (
  date date primary key,
  transmissions_created int not null default 0,
  outputs_posted int not null default 0,
  outputs_scheduled int not null default 0,
  follower_count int,
  notes text
);

-- audit log for regenerations / edits
create table if not exists output_revisions (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references channel_outputs(id) on delete cascade,
  body jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);
