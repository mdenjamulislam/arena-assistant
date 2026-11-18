import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-id');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Fallback in-memory state if user hasn't added Supabase credentials yet
export const memoryFallback = {
  messages: [] as any[],
  tasks: [
    {
      id: 'task-1',
      title: 'Review Q1 Architecture & AI Agent Workflow',
      description: 'Verify 9Router latency and tool execution pipelines',
      status: 'todo',
      priority: 'high',
      due_date: new Date().toISOString().split('T')[0],
      source: 'local',
      created_at: new Date().toISOString(),
    },
  ] as any[],
  approvals: [
    {
      id: 'app-1',
      action_type: 'social_post',
      platform: 'LinkedIn',
      payload: {
        content:
          'Excited to share that I just built my own autonomous Personal AI Assistant powered by 9Router and Supabase! #AI #FullStack #WebDev',
      },
      status: 'pending',
      created_at: new Date().toISOString(),
    },
  ] as any[],
  integrations: [
    { provider: 'google_calendar', name: 'Google Calendar', connected: false, config: { calendarId: 'primary', accessToken: '' } },
    { provider: 'notion', name: 'Notion Workspace', connected: false, config: { apiKey: '', databaseId: '' } },
    { provider: 'gmail', name: 'Gmail', connected: false, config: { accessToken: '', email: '' } },
    { provider: 'twitter', name: 'X (Twitter)', connected: false, config: { bearerToken: '', webhookUrl: '' } },
    { provider: 'linkedin', name: 'LinkedIn', connected: false, config: { accessToken: '', authorUrn: '' } },
    { provider: 'telegram', name: 'Telegram', connected: false, config: { botToken: '', chatId: '' } },
  ] as any[],
  memories: [
    { id: 'mem-1', fact: 'User is a full-stack developer building a $0 personal AI assistant with 9Router.' },
  ] as any[],
};