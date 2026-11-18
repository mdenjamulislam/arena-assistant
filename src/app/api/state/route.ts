import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured, memoryFallback } from '@/lib/supabase';

export async function GET() {
  try {
    if (isSupabaseConfigured && supabase) {
      const [messages, tasks, approvals, integrations, memories] = await Promise.all([
        supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(60),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('approvals').select('*').order('created_at', { ascending: false }),
        supabase.from('integrations').select('*').order('provider', { ascending: true }),
        supabase.from('memories').select('*').order('created_at', { ascending: false }),
      ]);

      return NextResponse.json({
        supabaseConnected: true,
        messages: messages.data || [],
        tasks: tasks.data || [],
        approvals: approvals.data || [],
        integrations: integrations.data || memoryFallback.integrations,
        memories: memories.data || [],
      });
    }

    return NextResponse.json({
      supabaseConnected: false,
      ...memoryFallback,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, ...memoryFallback }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    // 1. CREATE TASK
    if (action === 'create_task') {
      const newTask = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description || '',
        status: 'todo',
        priority: data.priority || 'medium',
        due_date: data.due_date || new Date().toISOString().split('T')[0],
        source: data.source || 'local',
        created_at: new Date().toISOString(),
      };
      if (isSupabaseConfigured && supabase) {
        await supabase.from('tasks').insert([newTask]);
      } else {
        memoryFallback.tasks.unshift(newTask);
      }
      return NextResponse.json({ success: true, task: newTask });
    }

    // 2. TOGGLE TASK STATUS
    if (action === 'toggle_task') {
      const newStatus = data.status === 'done' ? 'todo' : 'done';
      if (isSupabaseConfigured && supabase) {
        await supabase.from('tasks').update({ status: newStatus }).eq('id', data.id);
      } else {
        const t = memoryFallback.tasks.find((x) => x.id === data.id);
        if (t) t.status = newStatus;
      }
      return NextResponse.json({ success: true });
    }

    // 3. DELETE TASK
    if (action === 'delete_task') {
      if (isSupabaseConfigured && supabase) {
        await supabase.from('tasks').delete().eq('id', data.id);
      } else {
        memoryFallback.tasks = memoryFallback.tasks.filter((x) => x.id !== data.id);
      }
      return NextResponse.json({ success: true });
    }

    // 4. HANDLE HUMAN-IN-THE-LOOP APPROVAL (Approve / Reject Email or Social Post)
    if (action === 'resolve_approval') {
      const { id, decision } = data; // decision: 'approved' | 'rejected'
      let targetApproval: any = null;

      if (isSupabaseConfigured && supabase) {
        const { data: found } = await supabase.from('approvals').select('*').eq('id', id).single();
        targetApproval = found;
        await supabase.from('approvals').update({ status: decision }).eq('id', id);
      } else {
        targetApproval = memoryFallback.approvals.find((a) => a.id === id);
        if (targetApproval) targetApproval.status = decision;
      }

      let executionNote = `Action ${decision}.`;

      // If approved, execute real third-party API call if token is configured
      if (decision === 'approved' && targetApproval) {
        executionNote = await executeApprovedAction(targetApproval);
      }

      return NextResponse.json({ success: true, note: executionNote });
    }

    // 5. UPDATE THIRD-PARTY INTEGRATION CREDENTIALS
    if (action === 'update_integration') {
      const { provider, config, connected } = data;
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('integrations')
          .update({ config, connected, updated_at: new Date().toISOString() })
          .eq('provider', provider);
      } else {
        const item = memoryFallback.integrations.find((i) => i.provider === provider);
        if (item) {
          item.config = config;
          item.connected = connected;
        }
      }
      return NextResponse.json({ success: true });
    }

    // 6. CLEAR CHAT
    if (action === 'clear_chat') {
      if (isSupabaseConfigured && supabase) {
        await supabase.from('messages').delete().neq('role', 'none');
      } else {
        memoryFallback.messages = [];
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Helper to execute real API calls once the user clicks "Approve"
async function executeApprovedAction(approval: any): Promise<string> {
  try {
    let integrations = memoryFallback.integrations;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from('integrations').select('*');
      if (data) integrations = data;
    }

    // Telegram Bot Execution
    if (approval.platform.toLowerCase().includes('telegram')) {
      const tg = integrations.find((i) => i.provider === 'telegram');
      if (tg?.connected && tg.config?.botToken && tg.config?.chatId) {
        await fetch(`https://api.telegram.org/bot${tg.config.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tg.config.chatId,
            text: approval.payload.content || approval.payload.body,
          }),
        });
        return 'Successfully published to Telegram via Bot API!';
      }
    }

    // X / Custom Webhook Execution
    if (approval.platform.toLowerCase().includes('twitter') || approval.platform.toLowerCase().includes('x')) {
      const tw = integrations.find((i) => i.provider === 'twitter');
      if (tw?.connected && tw.config?.webhookUrl) {
        await fetch(tw.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(approval.payload),
        });
        return 'Successfully dispatched X (Twitter) post payload!';
      }
    }

    // Gmail REST API Execution
    if (approval.action_type === 'send_email') {
      const gm = integrations.find((i) => i.provider === 'gmail');
      if (gm?.connected && gm.config?.accessToken) {
        const rawEmail = [
          `To: ${approval.payload.recipient}`,
          `Subject: ${approval.payload.subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          approval.payload.body,
        ].join('\n');
        const encodedMessage = Buffer.from(rawEmail).toString('base64url');
        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gm.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        });
        return `Email sent to ${approval.payload.recipient} via Gmail API!`;
      }
    }

    return `Approved & executed (${approval.platform}).`;
  } catch (e: any) {
    return `Approved (Local simulation: ${e.message})`;
  }
}