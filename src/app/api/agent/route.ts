import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured, memoryFallback } from '@/lib/supabase';

const NINE_ROUTER_URL = process.env.NINE_ROUTER_BASE_URL || 'http://localhost:20128/v1';
const NINE_ROUTER_KEY = process.env.NINE_ROUTER_API_KEY || 'sk-';

// Free Zero-Cost Web Search (DuckDuckGo HTML + Wikipedia API fallback)
async function searchWebFree(query: string): Promise<string> {
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    const html = await res.text();

    // Parse snippets cleanly from DDG HTML
    const snippets: string[] = [];
    const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null && snippets.length < 5) {
      const clean = match[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
      if (clean) snippets.push(`- ${clean}`);
    }

    if (snippets.length > 0) {
      return `Web Search Results for "${query}":\n${snippets.join('\n')}`;
    }

    // Fallback to Wikipedia OpenSearch if DDG blocks or returns empty
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`
    );
    const wikiJson = await wikiRes.json();
    const wikiSnippets = (wikiJson?.query?.search || [])
      .slice(0, 4)
      .map((s: any) => `- ${s.title}: ${s.snippet.replace(/<\/?[^>]+(>|$)/g, '')}`);

    return wikiSnippets.length
      ? `Search Results for "${query}":\n${wikiSnippets.join('\n')}`
      : `No live snippets found for "${query}". Answer using internal knowledge.`;
  } catch (err: any) {
    return `Web search encountered a network issue: ${err.message}`;
  }
}

// Discover available models on 9Router
async function getAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${NINE_ROUTER_URL}/models`, {
      headers: { Authorization: `Bearer ${NINE_ROUTER_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return ['gpt-4o-mini', 'llama-3.3-70b-versatile', 'gemini-2.0-flash'];
    const data = await res.json();
    const ids = (data.data || []).map((m: any) => m.id);
    return ids.length > 0 ? ids : ['default'];
  } catch {
    return ['default', 'gpt-4o-mini', 'llama-3.3-70b'];
  }
}

export async function GET() {
  const models = await getAvailableModels();
  return NextResponse.json({ models, endpoint: NINE_ROUTER_URL });
}

export async function POST(req: NextRequest) {
  try {
    const { message, deepThink, attachedReport, preferredModel } = await req.json();

    // 1. Load current context (Tasks, Memories, Pending Approvals)
    let tasks = memoryFallback.tasks;
    let memories = memoryFallback.memories;
    let history = memoryFallback.messages;

    if (isSupabaseConfigured && supabase) {
      const [tRes, mRes, hRes] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(15),
        supabase.from('memories').select('*').limit(15),
        supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(14),
      ]);
      if (tRes.data) tasks = tRes.data;
      if (mRes.data) memories = mRes.data;
      if (hRes.data) history = hRes.data;
    }

    // 2. Save User Message
    const userMsgObj = {
      id: crypto.randomUUID(),
      role: 'user',
      content: attachedReport ? `${message}\n\n[Attached Report: ${attachedReport.name}]` : message,
      tool_calls: [],
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('messages').insert([userMsgObj]);
    } else {
      memoryFallback.messages.push(userMsgObj);
    }

    // 3. Automatic Web Search Trigger if query asks for news, live info, prices, research, or web search
    const needsSearch =
      /\b(search|web|latest|news|today|price|weather|who is|what happened|current|look up|market|bitcoin|ethereum)\b/i.test(
        message
      );
    let liveWebContext = '';
    const executedTools: any[] = [];

    if (needsSearch) {
      liveWebContext = await searchWebFree(message);
      executedTools.push({
        tool: 'web_search',
        status: 'completed',
        summary: `Searched the web for "${message.slice(0, 45)}..."`,
      });
    }

    // 4. Construct Structured Agent System Prompt (Works across ALL free models on 9Router)
    const systemPrompt = `You are AURA, a warm, human-like, hyper-capable Personal AI Assistant for a Full-Stack Developer.
Current Date/Time: ${new Date().toLocaleString()}
${deepThink ? 'DEEP THINK MODE ENABLED: Perform thorough, analytical, step-by-step reasoning before giving your recommendations.' : ''}

USER LONG-TERM MEMORIES:
${memories.map((m: any) => `- ${m.fact}`).join('\n') || 'None yet.'}

CURRENT USER TASKS:
${tasks.map((t: any) => `- [${t.status.toUpperCase()}] ${t.title} (Priority: ${t.priority}, Due: ${t.due_date})`).join('\n') || 'No active tasks.'}

${liveWebContext ? `\nLIVE WEB SEARCH DATA:\n${liveWebContext}\n` : ''}
${attachedReport ? `\nATTACHED REPORT / FILE CONTENT (${attachedReport.name}):\n${attachedReport.content.slice(0, 10000)}\n` : ''}

AGENT ACTION PROTOCOL:
You can execute real actions in the user's workspace by appending a JSON block at the VERY END of your response wrapped in \`\`\`action ... \`\`\`.
You may include multiple actions inside an array. Supported actions:
1. Create a task (or sync to Notion/Google Calendar):
   {"type": "create_task", "title": "...", "description": "...", "priority": "low|medium|high", "due_date": "YYYY-MM-DD", "source": "local|notion|google_calendar"}
2. Draft an Email (REQUIRES PERMISSION - queues into user's Approval Center):
   {"type": "queue_approval", "action_type": "send_email", "platform": "Gmail", "payload": {"recipient": "email@example.com", "subject": "...", "body": "..."}}
3. Post or Reply on Social Media (REQUIRES PERMISSION - queues into user's Approval Center):
   {"type": "queue_approval", "action_type": "social_post", "platform": "X (Twitter)|LinkedIn|Telegram", "payload": {"content": "..."}}
4. Save an important personal fact to memory:
   {"type": "save_memory", "fact": "..."}

Rules:
- Speak naturally, warmly, and concisely like a real human partner.
- NEVER send an email or post to social media without queueing it via "queue_approval" for user permission first.
- Only include the \`\`\`action JSON block when an action is genuinely requested or helpful.`;

    // 5. Select Model & Call 9Router
    const models = await getAvailableModels();
    const modelToUse = preferredModel && preferredModel !== 'auto' ? preferredModel : models[0];

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    let rawAssistantReply = '';
    try {
      const llmRes = await fetch(`${NINE_ROUTER_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${NINE_ROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: apiMessages,
          temperature: deepThink ? 0.4 : 0.7,
        }),
      });

      if (!llmRes.ok) {
        const errText = await llmRes.text();
        throw new Error(`9Router returned HTTP ${llmRes.status}: ${errText}`);
      }

      const llmData = await llmRes.json();
      rawAssistantReply =
        llmData.choices?.[0]?.message?.content ||
        llmData.choices?.[0]?.text ||
        'I processed your request.';
    } catch (routerError: any) {
      // Graceful fallback if 9Router isn't running on port 20128 right this second
      rawAssistantReply = await generateOfflineIntelligentFallback(
        message,
        liveWebContext,
        attachedReport,
        routerError.message
      );
    }

    // 6. Parse and Execute any ```action ... ``` blocks generated by the AI
    const actionRegex = /```action\s*([\s\S]*?)```/gi;
    let match;
    while ((match = actionRegex.exec(rawAssistantReply)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const actionsArray = Array.isArray(parsed) ? parsed : [parsed];

        for (const act of actionsArray) {
          if (act.type === 'create_task') {
            const newTask = {
              id: crypto.randomUUID(),
              title: act.title,
              description: act.description || '',
              status: 'todo',
              priority: act.priority || 'medium',
              due_date: act.due_date || new Date().toISOString().split('T')[0],
              source: act.source || 'local',
              created_at: new Date().toISOString(),
            };
            if (isSupabaseConfigured && supabase) {
              await supabase.from('tasks').insert([newTask]);
            } else {
              memoryFallback.tasks.unshift(newTask);
            }
            executedTools.push({
              tool: 'task_manager',
              status: 'completed',
              summary: `Created task: "${act.title}" (${act.source || 'local'})`,
            });
          }

          if (act.type === 'queue_approval') {
            const newApproval = {
              id: crypto.randomUUID(),
              action_type: act.action_type || 'social_post',
              platform: act.platform || 'LinkedIn',
              payload: act.payload || {},
              status: 'pending',
              created_at: new Date().toISOString(),
            };
            if (isSupabaseConfigured && supabase) {
              await supabase.from('approvals').insert([newApproval]);
            } else {
              memoryFallback.approvals.unshift(newApproval);
            }
            executedTools.push({
              tool: 'permission_guard',
              status: 'awaiting_approval',
              summary: `Drafted ${act.platform} action — awaiting your permission`,
            });
          }

          if (act.type === 'save_memory' && act.fact) {
            const newMem = {
              id: crypto.randomUUID(),
              fact: act.fact,
              created_at: new Date().toISOString(),
            };
            if (isSupabaseConfigured && supabase) {
              await supabase.from('memories').insert([newMem]);
            } else {
              memoryFallback.memories.unshift(newMem);
            }
            executedTools.push({
              tool: 'memory_vault',
              status: 'completed',
              summary: `Remembered: "${act.fact}"`,
            });
          }
        }
      } catch (e) {
        // Ignore malformed JSON block
      }
    }

    // Strip the raw ```action ... ``` block from the visible user text
    const cleanReply = rawAssistantReply.replace(/```action[\s\S]*?```/gi, '').trim();

    // 7. Save Assistant Response
    const assistantMsgObj = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: cleanReply,
      tool_calls: executedTools,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      await supabase.from('messages').insert([assistantMsgObj]);
    } else {
      memoryFallback.messages.push(assistantMsgObj);
    }

    return NextResponse.json({
      reply: cleanReply,
      tool_calls: executedTools,
      modelUsed: modelToUse,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Ensures tools (Tasks, Approvals, Search, Reports) still execute even if 9Router is temporarily offline
async function generateOfflineIntelligentFallback(
  message: string,
  webContext: string,
  report: any,
  routerErr: string
): Promise<string> {
  const lower = message.toLowerCase();

  if (lower.includes('post') || lower.includes('tweet') || lower.includes('linkedin') || lower.includes('social')) {
    const platform = lower.includes('linkedin') ? 'LinkedIn' : lower.includes('telegram') ? 'Telegram' : 'X (Twitter)';
    return `I've drafted that ${platform} post for you and placed it in your **Approval Queue** so you can review and approve it before it goes live.\n\n\`\`\`action\n{"type": "queue_approval", "action_type": "social_post", "platform": "${platform}", "payload": {"content": "${message.replace(/"/g, '\\"')}"}}\n\`\`\``;
  }

  if (lower.includes('email') || lower.includes('gmail') || lower.includes('mail')) {
    return `I've prepared the email draft and queued it for your permission. You can review the recipient and body in the **Approvals** panel.\n\n\`\`\`action\n{"type": "queue_approval", "action_type": "send_email", "platform": "Gmail", "payload": {"recipient": "team@example.com", "subject": "Follow up from Personal AI Assistant", "body": "${message.replace(/"/g, '\\"')}"}}\n\`\`\``;
  }

  if (lower.includes('task') || lower.includes('todo') || lower.includes('remind') || lower.includes('schedule')) {
    return `I've added that to your task list right away!\n\n\`\`\`action\n{"type": "create_task", "title": "${message.replace(/"/g, '\\"').slice(0, 70)}", "priority": "high", "source": "local"}\n\`\`\``;
  }

  if (report) {
    return `### Report Analysis (${report.name})\nI analyzed your uploaded document (${report.content.length} chars). Key takeaways:\n- Document structure parsed successfully.\n- Ready for deeper querying once your 9Router service at \`http://localhost:20128/v1\` responds.\n\n*(Note: 9Router connection diagnostic: ${routerErr})*`;
  }

  if (webContext) {
    return `Here is what I found on the live web:\n\n${webContext}\n\n*(Note: 9Router at \`http://localhost:20128/v1\` returned: ${routerErr}. Start 9Router for full LLM synthesis!)*`;
  }

  return `I'm listening and ready to help! However, I couldn't reach your local **9Router** instance at \`http://localhost:20128/v1\` (${routerErr}).\n\nMake sure **9Router** is running on port \`20128\`, or test my built-in tools right now by asking me to:\n- *"Create a high priority task to deploy the backend"*\n- *"Draft a LinkedIn post about my new AI assistant"*\n- *"Search the web for the latest AI news"*`;
}