'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  MessageSquare,
  CheckSquare,
  ShieldAlert,
  Settings,
  Plus,
  Paperclip,
  Lightbulb,
  Mic,
  Send,
  Globe,
  TrendingUp,
  Briefcase,
  Share2,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Check,
  X,
  Trash2,
  FileText,
  LogOut,
  CheckCircle2,
  Mail,
  ListChecks,
  Brain,
  Server,
} from 'lucide-react';

type TabMode = 'home' | 'chat' | 'tasks' | 'approvals' | 'settings';

const NAV_ITEMS: { id: TabMode; label: string; title: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Assistant', title: 'Voice & Orb Assistant', icon: Sparkles },
  { id: 'chat', label: 'Chat', title: 'Full Chat & Report Analysis', icon: MessageSquare },
  { id: 'tasks', label: 'Tasks', title: 'Task Management (Notion / Calendar)', icon: CheckSquare },
  { id: 'approvals', label: 'Approvals', title: 'Permission Center (Email & Social Media Approvals)', icon: ShieldAlert },
  { id: 'settings', label: 'Settings', title: '9Router & Memory Settings', icon: Settings },
];

export default function PersonalAssistantApp() {
  // Navigation & UI Modes
  const [activeTab, setActiveTab] = useState<TabMode>('home');
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);

  // Assistant State
  const [prompt, setPrompt] = useState('');
  const [deepThink, setDeepThink] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [attachedReport, setAttachedReport] = useState<{ name: string; content: string } | null>(null);

  // Data from Supabase / Backend
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [memories, setMemories] = useState<any[]>([]);

  // 9Router Models
  const [availableModels, setAvailableModels] = useState<string[]>(['auto']);
  const [selectedModel, setSelectedModel] = useState<string>('auto');

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskSource, setNewTaskSource] = useState('local');

  // Greeting (deferred to client to avoid Next.js prerender blocking)
  const [greeting, setGreeting] = useState('');

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initial Load
  useEffect(() => {
    fetchAppState();
    fetchModels();
    // Compute greeting client-side to avoid Next.js prerender blocking on new Date()
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening');
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function fetchAppState() {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      setSupabaseConnected(Boolean(data.supabaseConnected));
      setMessages(data.messages || []);
      setTasks(data.tasks || []);
      setApprovals(data.approvals || []);
      setIntegrations(data.integrations || []);
      setMemories(data.memories || []);
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  async function fetchModels() {
    try {
      const res = await fetch('/api/agent');
      const data = await res.json();
      if (data.models?.length) {
        setAvailableModels(['auto', ...data.models]);
      }
    } catch {
      // default fallback
    }
  }

  // Speech-to-Text (Web Speech API)
  function toggleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Your browser does not support Web Speech Recognition. Try Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      window.speechSynthesis?.cancel();
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(transcript);
      setIsListening(false);
      handleSendPrompt(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }

  // Text-to-Speech (Human-like Voice Output)
  function speakText(text: string) {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Clean markdown symbols before speaking
    const cleanText = text
      .replace(/[#*`_~]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .slice(0, 600);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((v) => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')) ||
      voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1.02;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  // File / Report Upload for Report Analysis
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setAttachedReport({ name: file.name, content });
    };
    reader.readAsText(file);
  }

  // Send Message to 9Router AI Agent
  async function handleSendPrompt(overrideText?: string) {
    const textToSend = (overrideText ?? prompt).trim();
    if (!textToSend && !attachedReport) return;

    const optimisticUserMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: attachedReport ? `${textToSend}\n\n📎 Attached: ${attachedReport.name}` : textToSend,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend || `Please analyze this attached report: ${attachedReport?.name}`,
          deepThink,
          attachedReport,
          preferredModel: selectedModel,
        }),
      });

      const data = await res.json();
      setAttachedReport(null);

      if (data.reply) {
        await fetchAppState();
        if (voiceEnabled && activeTab === 'home') {
          speakText(data.reply);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // Task CRUD Actions
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_task',
        data: { title: newTaskTitle, priority: newTaskPriority, source: newTaskSource },
      }),
    });
    setNewTaskTitle('');
    fetchAppState();
  }

  async function handleToggleTask(task: any) {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_task', data: { id: task.id, status: task.status } }),
    });
    fetchAppState();
  }

  async function handleDeleteTask(id: string) {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_task', data: { id } }),
    });
    fetchAppState();
  }

  // Human-in-the-loop Approval Resolution
  async function handleApprovalDecision(id: string, decision: 'approved' | 'rejected') {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_approval', data: { id, decision } }),
    });
    fetchAppState();
  }

  // Save Third-Party Tool Config
  async function handleSaveIntegration(provider: string, config: any, connected: boolean) {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_integration',
        data: { provider, config, connected },
      }),
    });
    fetchAppState();
  }

  async function handleClearChat() {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_chat' }),
    });
    fetchAppState();
  }

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;
  const pendingTasksCount = tasks.filter((t) => t.status !== 'done').length;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const busy = isListening || isSpeaking || isLoading;

  const badgeFor = (id: TabMode) => {
    if (id === 'tasks' && pendingTasksCount > 0) return { n: pendingTasksCount, cls: 'bg-indigo-500' };
    if (id === 'approvals' && pendingApprovalsCount > 0) return { n: pendingApprovalsCount, cls: 'bg-rose-500 animate-pulse' };
    return null;
  };

  const suggestions = [
    {
      icon: Globe,
      title: 'Daily web briefing',
      text: 'Search the web and summarize today’s tech & AI news',
      prompt: 'Search the web and give me a complete daily briefing on tech and AI news today.',
    },
    {
      icon: Share2,
      title: 'Draft a social post',
      text: 'Write a LinkedIn & X post and queue it for approval',
      prompt: 'Draft an engaging LinkedIn and X post about my current full-stack AI project and queue it for my permission.',
    },
    {
      icon: Mail,
      title: 'Client follow-up email',
      text: 'Draft a professional email about project milestones',
      prompt: 'Draft a professional follow-up email to my client regarding project milestones and ask for my approval.',
    },
    {
      icon: ListChecks,
      title: 'Review my tasks',
      text: `${pendingTasksCount} open task${pendingTasksCount === 1 ? '' : 's'} waiting for you`,
      action: () => setActiveTab('tasks'),
    },
  ] as { icon: React.ElementType; title: string; text: string; prompt?: string; action?: () => void }[];

  const pill =
    'flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden p-2 sm:p-4">
      {/* Decorative ambient blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-pink-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-200/50 blur-3xl" />
      <div className="pointer-events-none absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

      {/* Main Glass Frame */}
      <div className="glass-frame relative flex h-full w-full overflow-hidden rounded-[28px]">
        {/* ============ SIDEBAR ============ */}
        <aside className="z-20 flex w-[68px] flex-shrink-0 flex-col justify-between border-r border-white/70 bg-white/55 px-2.5 py-5 backdrop-blur-xl lg:w-60 lg:px-4">
          <div>
            <button
              onClick={() => setActiveTab('home')}
              className="mb-8 flex w-full items-center justify-center gap-3 lg:justify-start"
              title="Arena AI Home"
            >
              <span className="brand-mark flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-base font-bold leading-tight text-slate-900">Arena</span>
                <span className="block text-[11px] font-medium text-slate-400">Personal AI Workspace</span>
              </span>
            </button>

            <nav className="flex flex-col gap-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                const badge = badgeFor(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.title}
                    className={`group relative flex h-11 items-center justify-center gap-3 rounded-2xl px-0 transition-all lg:justify-start lg:px-3.5 ${
                      active
                        ? 'nav-active text-slate-900'
                        : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    <span className="hidden text-sm font-semibold lg:block">{item.label}</span>
                    {item.id === 'chat' && messages.length > 0 && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-pink-500 ring-2 ring-white lg:hidden" />
                    )}
                    {badge && (
                      <span
                        className={`absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white lg:static lg:ml-auto lg:h-5 lg:min-w-[20px] ${badge.cls}`}
                      >
                        {badge.n}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                if (isSpeaking) window.speechSynthesis?.cancel();
                setVoiceEnabled(!voiceEnabled);
              }}
              className="flex h-10 items-center justify-center gap-3 rounded-2xl text-slate-500 transition hover:bg-white/80 hover:text-slate-800 lg:justify-start lg:px-3.5"
              title={voiceEnabled ? 'Voice Output Enabled' : 'Voice Output Muted'}
            >
              {voiceEnabled ? <Volume2 className="h-[18px] w-[18px] text-pink-500" /> : <VolumeX className="h-[18px] w-[18px]" />}
              <span className="hidden text-sm font-medium lg:block">{voiceEnabled ? 'Voice on' : 'Voice muted'}</span>
            </button>
            <button
              onClick={handleClearChat}
              className="flex h-10 items-center justify-center gap-3 rounded-2xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 lg:justify-start lg:px-3.5"
              title="Reset Conversation"
            >
              <LogOut className="h-[18px] w-[18px]" />
              <span className="hidden text-sm font-medium lg:block">Reset chat</span>
            </button>
          </div>
        </aside>

        {/* ============ MAIN ============ */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-gradient-to-br from-[#fff9f7]/80 via-[#fdf4f8]/80 to-[#eef7fc]/80">
          {/* HEADER */}
          <header className="z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-8 sm:pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                9Router · localhost:20128
              </span>

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="max-w-[200px] cursor-pointer truncate rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:bg-white focus:ring-2 focus:ring-pink-200"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    Model: {m}
                  </option>
                ))}
              </select>

              <span className="hidden items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1.5 text-xs font-medium text-slate-500 md:inline-flex">
                DB: {supabaseConnected ? 'Supabase Live' : 'Local Memory (Ready)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {pendingApprovalsCount > 0 && (
                <button
                  onClick={() => setActiveTab('approvals')}
                  className="flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/90 px-3.5 py-2 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {pendingApprovalsCount} Awaiting Permission
                </button>
              )}

              <button
                onClick={() => setShowIntegrationsModal(true)}
                className="flex items-center gap-2 rounded-full border border-white bg-white/90 py-1.5 pl-1.5 pr-4 text-xs font-semibold text-slate-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition hover:scale-105 hover:bg-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-amber-100 to-pink-200 text-slate-700">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                Connect Tools
              </button>
            </div>
          </header>

          {/* CONTENT */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 sm:px-8">
            {/* ===== HOME ===== */}
            {activeTab === 'home' && (
              <div className="my-auto flex w-full max-w-3xl flex-col items-center py-4 text-center">
                <div className="relative flex flex-col items-center">
                  <button
                    onClick={toggleVoiceInput}
                    className={`iridescent-orb flex h-28 w-28 cursor-pointer items-center justify-center focus:outline-none sm:h-36 sm:w-36 ${
                      busy ? 'animate-orb-active' : 'animate-orb-idle'
                    }`}
                    title="Click to talk with Arena"
                  >
                    <Mic
                      className={`relative z-10 h-6 w-6 transition ${
                        isListening ? 'scale-125 text-white opacity-95' : 'text-white/50'
                      }`}
                    />
                  </button>
                  <div className="orb-reflection -mt-2 h-10 w-28 pointer-events-none sm:w-32" />
                </div>

                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {greeting}
                </h1>
                <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  <span className="text-slate-400/80">What’s on </span>
                  <span className="gradient-text">your mind?</span>
                </h2>

                <p
                  className={`mt-4 h-5 text-sm font-medium text-pink-600 ${busy ? 'animate-pulse' : 'opacity-0'}`}
                >
                  {isListening
                    ? '🎙️ Listening to you...'
                    : isLoading
                    ? '⚡ Thinking & orchestrating tools via 9Router...'
                    : isSpeaking
                    ? '🔊 Speaking...'
                    : '.'}
                </p>

                {lastAssistantMessage && (
                  <div className="mt-3 w-full max-w-xl rounded-2xl border border-white/90 bg-white/80 px-5 py-4 text-left shadow-[0_8px_30px_-12px_rgba(148,163,184,0.35)] backdrop-blur-md">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-pink-500">
                        <Sparkles className="h-3 w-3" /> Arena Response
                      </span>
                      <button
                        onClick={() => setActiveTab('chat')}
                        className="text-[11px] font-medium text-slate-400 transition hover:text-slate-700"
                      >
                        Expand Full Chat →
                      </button>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {lastAssistantMessage.content}
                    </p>
                    {lastAssistantMessage.tool_calls?.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {lastAssistantMessage.tool_calls.map((tc: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700"
                          >
                            <CheckCircle2 className="h-3 w-3" /> {tc.summary}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Suggestion cards */}
                <div className="mt-6 w-full">
                  <p className="mb-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Get started with an example below
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {suggestions.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.title}
                          onClick={() => (s.action ? s.action() : handleSendPrompt(s.prompt))}
                          className="group flex min-h-[116px] flex-col justify-between rounded-2xl border border-white/90 bg-white/70 p-4 text-left shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:bg-white hover:shadow-lg"
                        >
                          <div>
                            <p className="text-[13px] font-semibold leading-snug text-slate-800">{s.title}</p>
                            <p className="mt-1 text-xs leading-snug text-slate-500">{s.text}</p>
                          </div>
                          <span className="mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-gradient-to-tr group-hover:from-amber-100 group-hover:to-pink-200 group-hover:text-slate-800">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ===== CHAT ===== */}
            {activeTab === 'chat' && (
              <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col py-2">
                <div className="mb-3 flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Unified Agent Conversation</h2>
                    <p className="text-xs text-slate-500">
                      Connected to 9Router • Web Search, Report Analysis, Tasks & Permission Guard Active
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('home')}
                    className="rounded-full border border-slate-200/70 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-white"
                  >
                    Switch to Orb View
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto pb-4 pr-2">
                  {messages.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center text-center text-slate-400">
                      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-100 via-pink-100 to-cyan-100">
                        <Sparkles className="h-6 w-6 text-pink-500" />
                      </span>
                      <p className="text-sm font-semibold text-slate-600">No messages yet.</p>
                      <p className="mt-1 text-xs">Ask me to search the web, analyze a report, manage tasks, or draft a post!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            msg.role === 'user'
                              ? 'bg-slate-800 text-white'
                              : 'bg-gradient-to-tr from-amber-100 via-pink-200 to-cyan-100 text-slate-800'
                          }`}
                        >
                          {msg.role === 'user' ? 'You' : <Sparkles className="h-4 w-4" />}
                        </span>
                        <div
                          className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                            msg.role === 'user'
                              ? 'rounded-br-md bg-gradient-to-r from-pink-500 to-rose-400 text-white'
                              : 'rounded-bl-md border border-white bg-white/95 text-slate-800'
                          }`}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                          {msg.tool_calls && msg.tool_calls.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                              {msg.tool_calls.map((t: any, i: number) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                                >
                                  ⚡ {t.summary}
                                </span>
                              ))}
                            </div>
                          )}

                          {msg.role === 'assistant' && (
                            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                              <button
                                onClick={() => speakText(msg.content)}
                                className="flex items-center gap-1 transition hover:text-pink-500"
                              >
                                <Volume2 className="h-3 w-3" /> Read Aloud
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex items-end gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-100 via-pink-200 to-cyan-100">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div className="flex gap-1 rounded-3xl rounded-bl-md border border-white bg-white/95 px-4 py-3.5 shadow-sm">
                        <span className="typing-dot" />
                        <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                        <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}

            {/* ===== TASKS ===== */}
            {activeTab === 'tasks' && (
              <div className="flex w-full max-w-4xl flex-col py-2">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-800">Task & Schedule Manager</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Synced with Supabase • Supports Local, Notion & Google Calendar tasks
                  </p>
                </div>

                <form
                  onSubmit={handleCreateTask}
                  className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white bg-white/80 p-2.5 shadow-sm backdrop-blur-md"
                >
                  <input
                    type="text"
                    placeholder="Add a new task or milestone..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="min-w-[200px] flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                  <select
                    value={newTaskSource}
                    onChange={(e) => setNewTaskSource(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200"
                  >
                    <option value="local">Local Task</option>
                    <option value="notion">Notion Sync</option>
                    <option value="google_calendar">Google Calendar</option>
                  </select>
                  <button
                    type="submit"
                    className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Task
                  </button>
                </form>

                <div className="space-y-2.5 pb-4">
                  {tasks.length === 0 && (
                    <div className="rounded-2xl border border-white bg-white/70 p-10 text-center text-sm text-slate-400">
                      No tasks yet. Add your first one above.
                    </div>
                  )}
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white/85 px-4 py-3.5 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition ${
                            task.status === 'done'
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-300 bg-white hover:border-pink-400'
                          }`}
                        >
                          {task.status === 'done' && <Check className="h-3.5 w-3.5" />}
                        </button>
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-semibold ${
                              task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'
                            }`}
                          >
                            {task.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="capitalize">Source: {task.source}</span>
                            <span>•</span>
                            <span>Due: {task.due_date || 'Today'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            task.priority === 'high'
                              ? 'bg-rose-100 text-rose-700'
                              : task.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {task.priority}
                        </span>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== APPROVALS ===== */}
            {activeTab === 'approvals' && (
              <div className="flex w-full max-w-4xl flex-col py-2">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                    Permission & Approval Center
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Human-in-the-loop: Arena never posts to social media or sends an email without your explicit permission.
                  </p>
                </div>

                <div className="space-y-3 pb-4">
                  {approvals.length === 0 ? (
                    <div className="rounded-2xl border border-white bg-white/75 p-10 text-center text-sm text-slate-400">
                      No social posts or emails waiting for permission.
                    </div>
                  ) : (
                    approvals.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-pink-100 px-3 py-0.5 text-xs font-bold text-pink-700">
                              {item.platform}
                            </span>
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {item.action_type.replace('_', ' ')}
                            </span>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                              item.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : item.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {item.payload?.recipient && (
                          <p className="mb-1.5 text-xs font-semibold text-slate-700">
                            To: {item.payload.recipient} | Subject: {item.payload.subject}
                          </p>
                        )}

                        <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-700 sm:text-sm">
                          {item.payload?.content || item.payload?.body || JSON.stringify(item.payload)}
                        </div>

                        {item.status === 'pending' && (
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprovalDecision(item.id, 'rejected')}
                              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                            <button
                              onClick={() => handleApprovalDecision(item.id, 'approved')}
                              className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
                            >
                              <Check className="h-3.5 w-3.5" /> Approve & Execute
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ===== SETTINGS ===== */}
            {activeTab === 'settings' && (
              <div className="flex w-full max-w-3xl flex-col space-y-4 py-2 pb-4">
                <div className="rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                      <Server className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-bold text-slate-800">9Router Engine Configuration</h3>
                  </div>
                  <p className="mb-4 text-xs text-slate-500">
                    Pre-configured with your local 9Router free AI aggregator endpoint.
                  </p>
                  <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                      <span className="mb-1 block font-semibold text-slate-500">Base URL</span>
                      <code className="font-mono text-slate-800">http://localhost:20128/v1</code>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                      <span className="mb-1 block font-semibold text-slate-500">API Key</span>
                      <code className="font-mono text-slate-800">sk-••••••••••••••••</code>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
                      <Brain className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-bold text-slate-800">Assistant Long-Term Memory Vault</h3>
                  </div>
                  <div className="space-y-2">
                    {memories.length === 0 && (
                      <p className="text-xs text-slate-400">No memories stored yet.</p>
                    )}
                    {memories.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
                      >
                        🧠 {m.fact}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ============ COMPOSER ============ */}
          <div className="z-10 mx-auto w-full max-w-3xl px-4 pb-5 pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => handleSendPrompt('Search the web and give me a complete daily briefing on tech and AI news today.')}
                className={pill}
              >
                <Globe className="h-3.5 w-3.5 text-slate-500" /> Web Briefing
              </button>

              <button onClick={() => setActiveTab('tasks')} className={pill}>
                <TrendingUp className="h-3.5 w-3.5 text-slate-500" /> Manage Tasks ({pendingTasksCount})
              </button>

              <button
                onClick={() => handleSendPrompt('Draft an engaging LinkedIn and X post about my current full-stack AI project and queue it for my permission.')}
                className={pill}
              >
                <Share2 className="h-3.5 w-3.5 text-slate-500" /> Draft Social Post
              </button>

              <button
                onClick={() => handleSendPrompt('Draft a professional follow-up email to my client regarding project milestones and ask for my approval.')}
                className={pill}
              >
                <Briefcase className="h-3.5 w-3.5 text-slate-500" /> Manage Email
              </button>

              <button
                onClick={() => setShowIntegrationsModal(true)}
                className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/80 p-1.5 text-slate-600 shadow-sm transition hover:bg-white"
                title="More Tools"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

            {attachedReport && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
                <FileText className="h-3.5 w-3.5" />
                Report Attached: {attachedReport.name}
                <button onClick={() => setAttachedReport(null)} className="transition hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="rainbow-input-wrapper rounded-[26px]">
              <div className="flex flex-col rounded-[24px] bg-white/95 px-4 pb-3 pt-3.5 backdrop-blur-xl">
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  placeholder="Ask me anything... (Search web, analyze reports, manage tasks, draft emails or social posts)"
                  className="selectable w-full resize-none bg-transparent text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
                />

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".txt,.csv,.json,.md,.log"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Attach Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeepThink(!deepThink)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        deepThink
                          ? 'border-purple-300 bg-purple-50 text-purple-700'
                          : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Deep Think</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                        isListening
                          ? 'animate-pulse border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Mic className="h-3.5 w-3.5" /> {isListening ? 'Listening...' : 'Voice'}
                    </button>

                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSendPrompt()}
                      className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f472b6] to-[#ec4899] px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-pink-300/40 transition hover:opacity-95 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> {isLoading ? 'Working...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ============ INTEGRATIONS MODAL ============ */}
      {showIntegrationsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setShowIntegrationsModal(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Connect Third-Party Tools</h3>
                <p className="text-xs text-slate-500">
                  Connect Google Calendar, Notion, Gmail, and Social Media APIs. Stored securely in Supabase.
                </p>
              </div>
              <button
                onClick={() => setShowIntegrationsModal(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {integrations.map((integ) => (
                <IntegrationCard
                  key={integ.provider}
                  integration={integ}
                  onSave={handleSaveIntegration}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  onSave,
}: {
  integration: any;
  onSave: (provider: string, config: any, connected: boolean) => void;
}) {
  const [config, setConfig] = useState(integration.config || {});
  const [connected, setConnected] = useState(Boolean(integration.connected));
  const [savedToast, setSavedToast] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <h4 className="text-sm font-bold text-slate-800">{integration.name}</h4>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={connected}
            onChange={(e) => setConnected(e.target.checked)}
            className="rounded text-pink-500"
          />
          Enabled
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Object.keys(config).map((key) => (
          <div key={key}>
            <label className="mb-1 block text-[11px] font-medium capitalize text-slate-500">{key}</label>
            <input
              type={key.toLowerCase().includes('token') || key.toLowerCase().includes('key') ? 'password' : 'text'}
              value={config[key] || ''}
              onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              placeholder={`Enter ${key}...`}
              className="selectable w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        {savedToast && <span className="text-xs font-medium text-emerald-600">✓ Saved to Supabase</span>}
        <button
          onClick={() => {
            onSave(integration.provider, config, connected);
            setSavedToast(true);
            setTimeout(() => setSavedToast(false), 2000);
          }}
          className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          Save Connection
        </button>
      </div>
    </div>
  );
}