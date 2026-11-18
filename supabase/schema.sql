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

-- ============================================================
-- RLS: Enabled on all tables (personal single-user assistant)
-- The app uses the anon key server-side via Next.js API routes.
-- Policies grant full access to the `anon` role since there is
-- no auth system — all requests come from the trusted server.
-- ============================================================

alter table public.messages    enable row level security;
alter table public.tasks       enable row level security;
alter table public.approvals   enable row level security;
alter table public.integrations enable row level security;
alter table public.memories    enable row level security;

-- messages
create policy "anon can select messages"  on public.messages for select using (true);
create policy "anon can insert messages"  on public.messages for insert with check (true);
create policy "anon can delete messages"  on public.messages for delete using (true);

-- tasks
create policy "anon can select tasks"     on public.tasks for select using (true);
create policy "anon can insert tasks"     on public.tasks for insert with check (true);
create policy "anon can update tasks"     on public.tasks for update using (true) with check (true);
create policy "anon can delete tasks"     on public.tasks for delete using (true);

-- approvals
create policy "anon can select approvals" on public.approvals for select using (true);
create policy "anon can insert approvals" on public.approvals for insert with check (true);
create policy "anon can update approvals" on public.approvals for update using (true) with check (true);

-- integrations
create policy "anon can select integrations" on public.integrations for select using (true);
create policy "anon can insert integrations" on public.integrations for insert with check (true);
create policy "anon can update integrations" on public.integrations for update using (true) with check (true);

-- memories
create policy "anon can select memories"  on public.memories for select using (true);
create policy "anon can insert memories"  on public.memories for insert with check (true);
create policy "anon can delete memories"  on public.memories for delete using (true);

-- Insert default integrations
insert into public.integrations (provider, name, connected, config) values
  ('google_calendar', 'Google Calendar', false, '{"calendarId": "primary", "accessToken": ""}'),
  ('notion', 'Notion Workspace', false, '{"apiKey": "", "databaseId": ""}'),
  ('gmail', 'Gmail Account', false, '{"accessToken": "", "email": ""}'),
  ('twitter', 'X (Twitter)', false, '{"webhookUrl": "", "bearerToken": ""}'),
  ('linkedin', 'LinkedIn', false, '{"accessToken": "", "authorUrn": ""}'),
  ('telegram', 'Telegram Bot', false, '{"botToken": "", "chatId": ""}')
on conflict (provider) do nothing;