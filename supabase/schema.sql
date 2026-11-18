-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Chat Messages Table
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tool_calls jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Task Management Table
create table if not exists public.tasks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text default '',
  status text default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date text,
  source text default 'local', -- 'local', 'notion', 'google_calendar'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Human-in-the-Loop Approvals Table (Social Media & Email with Permission)
create table if not exists public.approvals (
  id uuid default uuid_generate_v4() primary key,
  action_type text not null, -- 'send_email', 'social_post', 'social_reply', 'calendar_event'
  platform text not null,    -- 'Gmail', 'X (Twitter)', 'LinkedIn', 'Telegram', 'Google Calendar'
  payload jsonb not null,    -- { recipient, subject, body, content, post_id }
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Third-Party Tool Integrations Table
create table if not exists public.integrations (
  id uuid default uuid_generate_v4() primary key,
  provider text unique not null, -- 'notion', 'google_calendar', 'gmail', 'twitter', 'linkedin', 'telegram'
  name text not null,
  connected boolean default false,
  config jsonb default '{}'::jsonb, -- stores tokens/webhook URLs/database IDs
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. User Long-Term Memory Table
create table if not exists public.memories (
  id uuid default uuid_generate_v4() primary key,
  fact text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Disable RLS for personal local assistant usage (or configure policies as needed)
alter table public.messages disable row level security;
alter table public.tasks disable row level security;
alter table public.approvals disable row level security;
alter table public.integrations disable row level security;
alter table public.memories disable row level security;

-- Insert default integrations
insert into public.integrations (provider, name, connected, config) values
  ('google_calendar', 'Google Calendar', false, '{"calendarId": "primary", "accessToken": ""}'),
  ('notion', 'Notion Workspace', false, '{"apiKey": "", "databaseId": ""}'),
  ('gmail', 'Gmail Account', false, '{"accessToken": "", "email": ""}'),
  ('twitter', 'X (Twitter)', false, '{"webhookUrl": "", "bearerToken": ""}'),
  ('linkedin', 'LinkedIn', false, '{"accessToken": "", "authorUrn": ""}'),
  ('telegram', 'Telegram Bot', false, '{"botToken": "", "chatId": ""}')
on conflict (provider) do nothing;