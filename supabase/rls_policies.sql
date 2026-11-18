-- ============================================================
-- AURA Assistant — RLS Policies for personal single-user app
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- messages: select, insert, delete
create policy "anon can select messages"  on public.messages for select using (true);
create policy "anon can insert messages"  on public.messages for insert with check (true);
create policy "anon can delete messages"  on public.messages for delete using (true);

-- tasks: full CRUD
create policy "anon can select tasks"     on public.tasks for select using (true);
create policy "anon can insert tasks"     on public.tasks for insert with check (true);
create policy "anon can update tasks"     on public.tasks for update using (true) with check (true);
create policy "anon can delete tasks"     on public.tasks for delete using (true);

-- approvals: select, insert, update (no delete needed from app)
create policy "anon can select approvals" on public.approvals for select using (true);
create policy "anon can insert approvals" on public.approvals for insert with check (true);
create policy "anon can update approvals" on public.approvals for update using (true) with check (true);

-- integrations: select, insert, update
create policy "anon can select integrations" on public.integrations for select using (true);
create policy "anon can insert integrations" on public.integrations for insert with check (true);
create policy "anon can update integrations" on public.integrations for update using (true) with check (true);

-- memories: select, insert, delete
create policy "anon can select memories"  on public.memories for select using (true);
create policy "anon can insert memories"  on public.memories for insert with check (true);
create policy "anon can delete memories"  on public.memories for delete using (true);
