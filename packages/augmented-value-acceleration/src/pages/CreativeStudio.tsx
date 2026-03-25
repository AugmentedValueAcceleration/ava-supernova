import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme } from '../lib/theme';

/* ══════════════════════════════════════════════════════════════════════
   Creative Studio — Augmented Value Acceleration Platform
   Single-file module: Chat + Canvas with SSE streaming
   ══════════════════════════════════════════════════════════════════════ */

const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || 'https://ava-platform.vercel.app';

/* ── Theme tokens (inline) ───────────────────────────────────────────── */

const T = {
  bg:        theme.pageBg,
  bgCard:    theme.cardBg,
  bgInput:   theme.inputBg,
  bgHover:   theme.border,
  accent:    theme.accent,
  accentDim: theme.accentBg,
  border:    theme.border,
  borderHi:  theme.borderSubtle,
  text:      theme.text,
  textSec:   theme.textSecondary,
  textMuted: theme.textMuted,
  white:     '#ffffff',
  purple:    theme.accentHover,
  purpleBg:  theme.accent,
  red:       theme.red,
  redBg:     theme.redBg,
  redBorder: `${theme.red}40`,
  green:     theme.green,
  greenBg:   theme.greenBg,
};

/* ── Types ─────────────────────────────────────────────────────────── */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolLog?: ToolLog[];
  isError?: boolean;
}

interface ToolLog {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

type CanvasItemType = 'text' | 'image';
type CanvasTab = 'posts' | 'images' | 'library';
type ContextId = 'social' | 'planner';

interface CanvasItem {
  id: string;
  type: CanvasItemType;
  content: string;
  title?: string;
  platform: string;
  timestamp: Date;
  copied: boolean;
  imageUrl?: string;
  imagePrompt?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tag?: string;
}

interface QuickPrompt {
  label: string;
  prompt: string;
}

interface LibraryAsset {
  id: string;
  type: string;
  title: string | null;
  prompt: string | null;
  platform: string;
  public_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ── Context definitions ─────────────────────────────────────────────── */

const MODELS_SOCIAL: ModelOption[] = [
  { id: 'kimi-k2.5',            name: 'Kimi K2.5',         provider: 'Moonshot AI', tag: 'Best for content' },
  { id: 'qwen3.5-plus',         name: 'Qwen 3.5 Plus',    provider: 'Alibaba',     tag: 'Best for content' },
  { id: 'claude-sonnet-4-6',    name: 'Claude Sonnet 4.6', provider: 'Anthropic',   tag: 'Best for content' },
  { id: 'mistral-large-latest', name: 'Mistral Large',     provider: 'Mistral',     tag: 'Best for content' },
  { id: 'glm-5',                name: 'GLM-5',             provider: 'Zhipu AI' },
  { id: 'deepseek-chat',        name: 'DeepSeek V3.2',     provider: 'DeepSeek' },
  { id: 'claude-opus-4-6',      name: 'Claude Opus 4.6',   provider: 'Anthropic' },
  { id: 'claude-haiku-4-5',     name: 'Claude Haiku 4.5',  provider: 'Anthropic',   tag: 'Fast' },
  { id: 'deepseek-reasoner',    name: 'DeepSeek Reasoner', provider: 'DeepSeek',    tag: 'Deep thinking' },
  { id: 'qwen-flash',           name: 'Qwen Flash',        provider: 'Alibaba Cloud', tag: 'Free' },
];

const MODELS_PLANNER: ModelOption[] = [
  { id: 'glm-5',                name: 'GLM-5',            provider: 'Zhipu AI' },
  { id: 'kimi-k2.5',            name: 'Kimi K2.5',        provider: 'Moonshot AI' },
  { id: 'deepseek-chat',        name: 'DeepSeek V3.2',    provider: 'DeepSeek' },
  { id: 'qwen3.5-plus',         name: 'Qwen 3.5 Plus',    provider: 'Alibaba' },
  { id: 'mistral-large-latest', name: 'Mistral Large',    provider: 'Mistral' },
  { id: 'devstral-latest',      name: 'Devstral 2',       provider: 'Mistral' },
  { id: 'codestral-latest',     name: 'Codestral',        provider: 'Mistral' },
  { id: 'deepseek-reasoner',    name: 'DeepSeek Reasoner', provider: 'DeepSeek' },
];

const PROMPTS_SOCIAL: QuickPrompt[] = [
  { label: 'Tweet — Ava\'s voice',     prompt: 'I want a tweet in Ava\'s voice. Ask me what to focus on.' },
  { label: 'Tweet — Professional',      prompt: 'I want a professional tweet. Ask me what to focus on.' },
  { label: 'LinkedIn Post',             prompt: 'I want a LinkedIn post. Ask me what to focus on.' },
  { label: 'Twitter Thread',            prompt: 'I want a Twitter thread. Ask me what to focus on.' },
  { label: 'Banter Tweet',              prompt: 'I want a banter tweet. Ask me what angle to take.' },
  { label: 'Big Tech Clap Back',        prompt: 'I want a clap back tweet responding to a big tech leader. Ask me what to focus on.' },
  { label: 'Stats Update',              prompt: 'Write a stats update post. Ask me which platform.' },
  { label: 'Feature Spotlight',         prompt: 'I want to spotlight a feature. Ask me what to focus on.' },
  { label: 'Blog Article',              prompt: 'I want to write a blog article. Ask me what to focus on.' },
  { label: 'Announcement',              prompt: 'I want to write an announcement. Ask me what to focus on.' },
  { label: 'Release Notes',             prompt: 'I want to write release notes. Ask me what was shipped.' },
  { label: 'Social Media Graphic',      prompt: 'Generate a social media graphic. Ask me what to showcase.' },
  { label: 'Promotional Banner',        prompt: 'Generate a promotional banner image for Ava | Supernova.' },
];

const PROMPTS_PLANNER: QuickPrompt[] = [
  { label: 'Show the roadmap',       prompt: 'Show me the current roadmap' },
  { label: 'Plan Q3 features',       prompt: 'Plan Q3 features for the platform' },
  { label: 'Create roadmap items',   prompt: 'Create items for MCP support' },
  { label: 'What\'s shipped?',       prompt: 'What shipped items do we have?' },
  { label: 'Plan a new feature',     prompt: 'I want to plan a new feature. Ask me what it is.' },
  { label: 'Roadmap update',         prompt: 'Give me a roadmap status update for the current sprint.' },
  { label: 'Sprint review',          prompt: 'Help me write a sprint review for what we shipped this week.' },
];

const CONTEXTS: Record<ContextId, {
  label: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  endpoint: string;
  welcome: string;
  placeholder: string;
  models: ModelOption[];
  defaultModel: string;
  prompts: QuickPrompt[];
  hasCanvas: boolean;
}> = {
  social: {
    label: 'Social Media',
    badge: 'STUDIO',
    badgeBg: 'rgba(147,51,234,0.15)',
    badgeText: '#c084fc',
    endpoint: `${PLATFORM_URL}/api/admin/content/generate`,
    welcome: "Welcome to the Creative Studio. I can create text posts and generate AI images — all from one conversation.\n\n**Posts** — tweets, LinkedIn, blogs, announcements for any platform\n**Images** — AI-generated graphics, banners, and social media visuals\n\nTell me what you need or use the quick prompts. Output appears in the canvas.",
    placeholder: 'What do you want to create — a post or image?',
    models: MODELS_SOCIAL,
    defaultModel: 'kimi-k2.5',
    prompts: PROMPTS_SOCIAL,
    hasCanvas: true,
  },
  planner: {
    label: 'Planner',
    badge: 'PLANNER',
    badgeBg: 'rgba(59,130,246,0.15)',
    badgeText: '#60a5fa',
    endpoint: `${PLATFORM_URL}/api/admin/planner`,
    welcome: '',
    placeholder: 'Plan roadmap items, ask about the roadmap...',
    models: MODELS_PLANNER,
    defaultModel: 'glm-5',
    prompts: PROMPTS_PLANNER,
    hasCanvas: false,
  },
};

/* ── Tool labels ─────────────────────────────────────────────────────── */

const TOOL_LABELS: Record<string, string> = {
  save_content: 'Saved content to canvas',
  search_platform_specs: 'Searched platform specs',
  web_search: 'Searched the web',
  recent_commits: 'Fetched recent commits',
  get_datetime: 'Got date/time',
  read_file: 'Read file',
  list_directory: 'Listed directory',
  search_code: 'Searched code',
  design_graphic: 'Designed graphic',
  generate_image: 'Generated image',
  list_roadmap_items: 'Listed roadmap items',
  create_roadmap_item: 'Created roadmap item',
  update_roadmap_item: 'Updated roadmap item',
  delete_roadmap_item: 'Deleted roadmap item',
};

/* ── Platform detection for canvas items ─────────────────────────────── */

const PLATFORM_STYLES: Record<string, { bg: string; text: string }> = {
  tweet:       { bg: 'rgba(14,165,233,0.2)',  text: '#38bdf8' },
  linkedin:    { bg: 'rgba(59,130,246,0.2)',   text: '#60a5fa' },
  thread:      { bg: 'rgba(168,85,247,0.2)',   text: '#c084fc' },
  facebook:    { bg: 'rgba(37,99,235,0.2)',    text: '#93bbfd' },
  instagram:   { bg: 'rgba(236,72,153,0.2)',   text: '#f472b6' },
  reddit:      { bg: 'rgba(249,115,22,0.2)',   text: '#fb923c' },
  discord:     { bg: 'rgba(99,102,241,0.2)',   text: '#a5b4fc' },
  youtube:     { bg: 'rgba(239,68,68,0.2)',    text: '#f87171' },
  producthunt: { bg: 'rgba(245,158,11,0.2)',   text: '#fbbf24' },
  post:        { bg: 'rgba(107,114,128,0.2)',  text: '#9ca3af' },
  content:     { bg: 'rgba(16,185,129,0.2)',   text: '#34d399' },
  image:       { bg: 'rgba(168,85,247,0.2)',   text: '#c084fc' },
};

const PLATFORM_LIMITS: Record<string, number> = {
  tweet: 280,
  linkedin: 3000,
  facebook: 63206,
};

function detectPlatform(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('tweet 1') || lower.includes('1/') || lower.includes('thread')) return 'thread';
  if ((lower.includes('#') && lower.includes('instagram')) || (lower.match(/#\w+/g)?.length ?? 0) >= 5) return 'instagram';
  if (lower.includes('reddit') || lower.includes('r/')) return 'reddit';
  if (lower.includes('youtube') || lower.includes('timestamps')) return 'youtube';
  if (lower.includes('product hunt')) return 'producthunt';
  if (lower.includes('discord')) return 'discord';
  if (content.length <= 280) return 'tweet';
  if (content.length <= 3000) return 'linkedin';
  if (content.length <= 5000) return 'facebook';
  return 'post';
}

/* ── localStorage helpers ─────────────────────────────────────────── */

function loadMessages(ctxId: string, welcome: string): Message[] {
  try {
    const stored = localStorage.getItem(`studio_messages_${ctxId}`);
    if (stored) {
      return (JSON.parse(stored) as Message[]).map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    }
  } catch { /* ignore */ }
  if (welcome) {
    return [{ id: '0', role: 'assistant', content: welcome, timestamp: new Date() }];
  }
  return [];
}

function persistMessages(ctxId: string, msgs: Message[]) {
  try { localStorage.setItem(`studio_messages_${ctxId}`, JSON.stringify(msgs)); } catch { /* quota */ }
}

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

export default function CreativeStudio() {
  /* ── Context state ─────────────────────────────────────────────── */
  const [activeCtx, setActiveCtx] = useState<ContextId>('social');
  const ctx = CONTEXTS[activeCtx];

  /* ── Model selection ───────────────────────────────────────────── */
  const [modelMap, setModelMap] = useState<Record<string, string>>(() => {
    try {
      const s = localStorage.getItem('studio_models');
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });
  const model = modelMap[activeCtx] || ctx.defaultModel;
  const setModel = (m: string) => {
    const next = { ...modelMap, [activeCtx]: m };
    setModelMap(next);
    try { localStorage.setItem('studio_models', JSON.stringify(next)); } catch { /* */ }
  };
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  /* ── Chat state ────────────────────────────────────────────────── */
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(activeCtx, ctx.welcome));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveToolLog, setLiveToolLog] = useState<ToolLog[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* ── Quick prompts ─────────────────────────────────────────────── */
  const [promptsOpen, setPromptsOpen] = useState(false);
  const promptsRef = useRef<HTMLDivElement>(null);

  /* ── Canvas state ──────────────────────────────────────────────── */
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [canvasTab, setCanvasTab] = useState<CanvasTab>('posts');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  /* ── Library state ─────────────────────────────────────────────── */
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  /* ── Tool log expand state ─────────────────────────────────────── */
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  /* ── Effects ───────────────────────────────────────────────────── */

  // Persist messages
  useEffect(() => { persistMessages(activeCtx, messages); }, [activeCtx, messages]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, liveToolLog, loading]);

  // Focus input on context switch
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [activeCtx]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (promptsRef.current && !promptsRef.current.contains(e.target as Node)) setPromptsOpen(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reload messages on context switch
  const prevCtx = useRef(activeCtx);
  useEffect(() => {
    if (prevCtx.current !== activeCtx) {
      prevCtx.current = activeCtx;
      setMessages(loadMessages(activeCtx, CONTEXTS[activeCtx].welcome));
      setInput('');
      setLoading(false);
      setLiveToolLog([]);
    }
  }, [activeCtx]);

  // Load library assets when library tab is active
  useEffect(() => {
    if (canvasTab === 'library') loadLibrary();
  }, [canvasTab]);

  /* ── Library loader ────────────────────────────────────────────── */

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const { data } = await supabase
        .from('creative_assets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setLibraryAssets(data || []);
    } catch { /* ignore */ }
    setLibraryLoading(false);
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    await supabase.from('creative_assets').delete().eq('id', id);
    setLibraryAssets(prev => prev.filter(a => a.id !== id));
    if (selectedAssetId === id) setSelectedAssetId(null);
  }, [selectedAssetId]);

  /* ── Canvas helpers ────────────────────────────────────────────── */

  const addCanvasItem = useCallback((item: CanvasItem) => {
    setCanvasItems(prev => [item, ...prev]);
    setSelectedItemId(item.id);
    // Auto-switch to the right tab
    if (item.type === 'image') setCanvasTab('images');
    else setCanvasTab('posts');
  }, []);

  const removeCanvasItem = useCallback((id: string) => {
    setCanvasItems(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === selectedItemId) setSelectedItemId(next[0]?.id || null);
      return next;
    });
  }, [selectedItemId]);

  const copyCanvasItem = useCallback((id: string) => {
    const item = canvasItems.find(c => c.id === id);
    if (!item) return;
    navigator.clipboard.writeText(item.content);
    setCanvasItems(prev => prev.map(c => c.id === id ? { ...c, copied: true } : c));
    setTimeout(() => {
      setCanvasItems(prev => prev.map(c => c.id === id ? { ...c, copied: false } : c));
    }, 2000);
  }, [canvasItems]);

  const clearCanvas = useCallback(() => {
    setCanvasItems([]);
    setSelectedItemId(null);
  }, []);

  /* ── SSE handler ───────────────────────────────────────────────── */

  const handleSSE = useCallback(async (res: Response): Promise<{ content: string; tools: ToolLog[]; hadError: boolean }> => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const tools: ToolLog[] = [];
    let content = '';
    let hadError = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json);

          if (evt.type === 'tool_call') {
            tools.push({ name: evt.name, args: evt.args });
            setLiveToolLog([...tools]);
          } else if (evt.type === 'tool_result') {
            const last = [...tools].reverse().find(t => t.name === evt.name);
            if (last) { last.result = evt.result; setLiveToolLog([...tools]); }
          } else if (evt.type === 'canvas_update') {
            addCanvasItem({
              id: Date.now().toString(),
              type: 'text',
              content: evt.body || '',
              title: evt.title,
              platform: detectPlatform(evt.body || ''),
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'image_update') {
            addCanvasItem({
              id: Date.now().toString(),
              type: 'image',
              content: evt.prompt || '',
              imageUrl: evt.url,
              imagePrompt: evt.prompt,
              platform: 'image',
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'graphic_design') {
            // For graphic_design, the web version renders HTML to PNG via html2canvas.
            // In the platform we skip that and just note it was designed.
            // If there's a rendered URL in a subsequent image_update, that will be caught above.
            addCanvasItem({
              id: Date.now().toString(),
              type: 'image',
              content: evt.description || 'Designed graphic',
              imagePrompt: evt.description || 'Designed graphic',
              platform: 'image',
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'text') {
            content = evt.content;
          } else if (evt.type === 'error') {
            content = `Error: ${evt.message}`;
            hadError = true;
          }
        } catch { /* skip malformed */ }
      }
    }

    setLiveToolLog([]);
    return { content, tools, hadError };
  }, [addCanvasItem]);

  /* ── Send message ──────────────────────────────────────────────── */

  const send = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setLiveToolLog([]);

    try {
      const body: Record<string, unknown> = {
        model,
        platform: 'general',
        messages: [
          ...messages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: msg },
        ],
      };

      const res = await fetch(ctx.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${err.error || 'Unknown error'}`,
          timestamp: new Date(),
          isError: true,
        }]);
        setLoading(false);
        return;
      }

      const { content, tools, hadError } = await handleSSE(res);
      setLoading(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolLog: tools.length > 0 ? [...tools] : undefined,
        ...(hadError && { isError: true }),
      }]);
    } catch (err) {
      setLiveToolLog([]);
      setLoading(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
        isError: true,
      }]);
    }
  }, [input, loading, messages, model, ctx.endpoint, handleSSE]);

  /* ── Clear chat ────────────────────────────────────────────────── */

  const clearChat = useCallback(() => {
    setLiveToolLog([]);
    try {
      localStorage.removeItem(`studio_messages_${activeCtx}`);
    } catch { /* */ }
    if (ctx.welcome) {
      setMessages([{ id: '0', role: 'assistant', content: ctx.welcome, timestamp: new Date() }]);
    } else {
      setMessages([]);
    }
    clearCanvas();
  }, [activeCtx, ctx.welcome, clearCanvas]);

  /* ── Key handler ───────────────────────────────────────────────── */

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ── Filtered canvas items ─────────────────────────────────────── */

  const filteredItems = canvasItems.filter(item => {
    if (canvasTab === 'posts') return item.type === 'text';
    if (canvasTab === 'images') return item.type === 'image';
    return false;
  });

  const activeItem = selectedItemId
    ? filteredItems.find(i => i.id === selectedItemId) || filteredItems[0] || null
    : filteredItems[0] || null;

  /* ── Render helpers ────────────────────────────────────────────── */

  const selectedModel = ctx.models.find(m => m.id === model);

  const renderMarkdown = (text: string) => {
    // Simple markdown: bold only
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: T.white, fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: T.bg, color: T.text, overflow: 'hidden' }}>

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <PageHeader title="Creative Studio" />
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.bgCard }}>

        {/* Context tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(CONTEXTS) as ContextId[]).map(id => {
            const c = CONTEXTS[id];
            const isActive = activeCtx === id;
            return (
              <button
                key={id}
                onClick={() => setActiveCtx(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: isActive ? `1px solid rgba(168,85,247,0.3)` : '1px solid transparent',
                  background: isActive ? T.accentDim : 'transparent',
                  color: isActive ? T.white : T.textMuted,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {id === 'social' ? (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                )}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Model selector */}
          <div ref={modelRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.bgInput,
                color: T.textSec,
                fontSize: 12,
                cursor: 'pointer',
                minWidth: 200,
                justifyContent: 'space-between',
              }}
            >
              <span>
                {selectedModel?.name || model}
                {selectedModel?.tag && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: T.textMuted }}>{selectedModel.tag}</span>
                )}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                style={{ transform: modelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {modelOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                width: 280,
                maxHeight: 360,
                overflowY: 'auto',
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                zIndex: 50,
                padding: '4px 0',
              }}>
                {ctx.models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelOpen(false); }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      background: m.id === model ? T.accentDim : 'transparent',
                      color: m.id === model ? T.white : T.textSec,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{m.name}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>
                      {m.provider}{m.tag ? ` · ${m.tag}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear button */}
          {messages.length > (ctx.welcome ? 1 : 0) && (
            <button
              onClick={clearChat}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                color: T.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Main content: Chat + Canvas ─────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── CHAT PANEL (left, 60%) ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: ctx.hasCanvas ? '0 0 60%' : '1 1 auto', minWidth: 0, overflow: 'hidden', borderRight: ctx.hasCanvas ? `1px solid ${T.border}` : 'none' }}>

          {/* Messages area */}
          <div
            ref={chatContainerRef}
            style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px' }}
          >
            {/* Empty state */}
            {messages.length === 0 && !loading && ctx.prompts.length > 0 && (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: T.white, marginBottom: 6 }}>{ctx.label}</h2>
                  <p style={{ fontSize: 13, color: T.textMuted, maxWidth: 400, margin: '0 auto 20px' }}>
                    Chat with Ava in {ctx.label} mode
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                    {ctx.prompts.slice(0, 4).map(s => (
                      <button
                        key={s.prompt}
                        onClick={() => send(s.prompt)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          background: T.bgCard,
                          color: T.textSec,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <div key={msg.id} style={{ marginBottom: 16, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'user' ? (
                  <div style={{
                    maxWidth: '75%',
                    padding: '10px 16px',
                    borderRadius: '16px 16px 4px 16px',
                    background: T.purpleBg,
                    color: T.white,
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: '85%' }}>
                    {/* Tool log */}
                    {msg.toolLog && msg.toolLog.length > 0 && (
                      <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {msg.toolLog.map((tool, j) => {
                          const toolKey = `${msg.id}-${j}`;
                          const isExpanded = expandedTools[toolKey];
                          const isComplete = tool.result !== undefined;
                          return (
                            <div key={j} style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgInput, fontSize: 11 }}>
                              <button
                                onClick={() => setExpandedTools(prev => ({ ...prev, [toolKey]: !isExpanded }))}
                                style={{
                                  display: 'flex',
                                  width: '100%',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 10px',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: T.textSec,
                                  textAlign: 'left',
                                }}
                              >
                                {isComplete ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 1s linear infinite' }} />
                                )}
                                <span>{TOOL_LABELS[tool.name] || tool.name}</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth={2}
                                  style={{ marginLeft: 'auto', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 10px' }}>
                                  <p style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 500 }}>Arguments</p>
                                  <pre style={{ fontSize: 10, color: T.textSec, background: T.bg, padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 120, margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(tool.args, null, 2)}
                                  </pre>
                                  {tool.result !== undefined && (
                                    <>
                                      <p style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 500 }}>Result</p>
                                      <pre style={{ fontSize: 10, color: T.textSec, background: T.bg, padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 160, margin: 0, whiteSpace: 'pre-wrap' }}>
                                        {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                                      </pre>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      padding: '10px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      background: msg.isError ? T.redBg : T.bgCard,
                      border: `1px solid ${msg.isError ? T.redBorder : T.border}`,
                      color: msg.isError ? '#fca5a5' : T.text,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Ava</span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: ctx.badgeBg,
                          color: ctx.badgeText,
                          letterSpacing: '0.05em',
                        }}>
                          {ctx.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live tool log while loading */}
            {loading && liveToolLog.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '85%' }}>
                {liveToolLog.map((tool, j) => {
                  const isComplete = tool.result !== undefined;
                  return (
                    <div key={j} style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgInput, fontSize: 11, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isComplete ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 1s linear infinite' }} />
                      )}
                      <span style={{ color: T.textSec }}>{TOOL_LABELS[tool.name] || tool.name}</span>
                      {typeof tool.result === 'string' && (
                        <span style={{ color: T.textMuted, marginLeft: 4, fontSize: 10 }}>{tool.result}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Loading dots */}
            {loading && liveToolLog.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: T.bgCard,
                  border: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Ava</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: ctx.badgeBg, color: ctx.badgeText, letterSpacing: '0.05em',
                  }}>{ctx.badge}</span>
                  <span style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: T.accent,
                        animation: `bounce 1.2s infinite ${i * 0.15}s`,
                      }} />
                    ))}
                  </span>
                  <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 4 }}>Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ───────────────────────────────────────────── */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 20px', background: T.bgCard }}>
            {/* Quick prompts */}
            <div style={{ marginBottom: ctx.prompts.length > 0 ? 10 : 0 }}>
              {ctx.prompts.length > 0 && (
                <div ref={promptsRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={() => setPromptsOpen(!promptsOpen)}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: T.bgInput,
                      color: T.textSec,
                      fontSize: 12,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.3 : 1,
                    }}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={T.accent} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                    Quick Prompts
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      style={{ transform: promptsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {promptsOpen && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      bottom: '100%',
                      marginBottom: 4,
                      width: 340,
                      maxHeight: 400,
                      overflowY: 'auto',
                      background: T.bgCard,
                      border: `1px solid ${T.border}`,
                      borderRadius: 12,
                      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                      zIndex: 30,
                      padding: '4px 0',
                    }}>
                      {ctx.prompts.map((qp, i) => (
                        <button
                          key={i}
                          onClick={() => { send(qp.prompt); setPromptsOpen(false); }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 16px',
                            background: 'transparent',
                            border: 'none',
                            color: T.textSec,
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                          onMouseOver={e => { (e.target as HTMLElement).style.background = T.accentDim; (e.target as HTMLElement).style.color = T.white; }}
                          onMouseOut={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = T.textSec; }}
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Text input + send */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={ctx.placeholder}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                  background: T.bgInput,
                  color: T.white,
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  maxHeight: 120,
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  opacity: loading ? 0.5 : 1,
                }}
                onFocus={e => { e.target.style.borderColor = T.accent; }}
                onBlur={e => { e.target.style.borderColor = T.border; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  border: 'none',
                  background: T.purpleBg,
                  color: T.white,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                  opacity: (!input.trim() || loading) ? 0.3 : 1,
                  flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── CANVAS PANEL (right, 40%) ─────────────────────────────── */}
        {ctx.hasCanvas && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 40%', background: `${T.bgCard}cc`, overflow: 'hidden' }}>

            {/* Canvas header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={T.accent} strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.white }}>Canvas</span>
              </div>
              {canvasItems.length > 0 && (
                <button
                  onClick={clearCanvas}
                  style={{ fontSize: 11, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseOver={e => { (e.target as HTMLElement).style.color = T.red; }}
                  onMouseOut={e => { (e.target as HTMLElement).style.color = T.textMuted; }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Canvas tabs: Posts / Images / Library */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              {(['posts', 'images', 'library'] as CanvasTab[]).map(tab => {
                const labels: Record<CanvasTab, string> = { posts: 'Posts', images: 'Images', library: 'Library' };
                const counts: Record<CanvasTab, number> = {
                  posts: canvasItems.filter(i => i.type === 'text').length,
                  images: canvasItems.filter(i => i.type === 'image').length,
                  library: libraryAssets.length,
                };
                const isActive = canvasTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setCanvasTab(tab)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '10px 0',
                      fontSize: 12,
                      fontWeight: 500,
                      background: 'none',
                      border: 'none',
                      borderBottom: `2px solid ${isActive ? T.accent : 'transparent'}`,
                      color: isActive ? T.white : T.textMuted,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {labels[tab]}
                    {counts[tab] > 0 && (
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: T.bgInput,
                        color: T.textMuted,
                      }}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Canvas content */}
            {canvasTab !== 'library' ? (
              <>
                {/* Item tabs */}
                {filteredItems.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: `1px solid ${T.border}`, overflowX: 'auto', flexShrink: 0 }}>
                    {filteredItems.map((item, i) => {
                      const isActive = (selectedItemId || filteredItems[0]?.id) === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          style={{
                            flexShrink: 0,
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 500,
                            border: isActive ? 'none' : `1px solid ${T.border}`,
                            background: isActive ? T.purpleBg : T.bgCard,
                            color: isActive ? T.white : T.textMuted,
                            cursor: 'pointer',
                          }}
                        >
                          #{filteredItems.length - i}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Active item content */}
                {activeItem ? (
                  activeItem.type === 'text' ? (
                    /* ── Post view ──────────────────────────────────── */
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      {/* Platform badge row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: PLATFORM_STYLES[activeItem.platform]?.bg || PLATFORM_STYLES.post.bg,
                            color: PLATFORM_STYLES[activeItem.platform]?.text || PLATFORM_STYLES.post.text,
                          }}>
                            {activeItem.platform.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 11, color: T.textMuted }}>{activeItem.content.length} chars</span>
                          {PLATFORM_LIMITS[activeItem.platform] && activeItem.content.length <= PLATFORM_LIMITS[activeItem.platform] && (
                            <span style={{ fontSize: 11, color: T.green }}>Ready</span>
                          )}
                          {PLATFORM_LIMITS[activeItem.platform] && activeItem.content.length > PLATFORM_LIMITS[activeItem.platform] && (
                            <span style={{ fontSize: 11, color: T.red }}>+{activeItem.content.length - PLATFORM_LIMITS[activeItem.platform]} over</span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: T.textMuted }}>
                          {activeItem.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {activeItem.title && (
                        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}` }}>
                          <h3 style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{activeItem.title}</h3>
                        </div>
                      )}

                      {/* Content */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        <div style={{ fontSize: 13, color: '#e5e5f0', lineHeight: 1.7, whiteSpace: 'pre-wrap', userSelect: 'all' }}>
                          {activeItem.content}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                        <button
                          onClick={() => copyCanvasItem(activeItem.id)}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '8px 0',
                            borderRadius: 8,
                            border: 'none',
                            background: activeItem.copied ? T.green : T.purpleBg,
                            color: T.white,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          {activeItem.copied ? 'Copied!' : 'Copy to Clipboard'}
                        </button>
                        <button
                          onClick={() => removeCanvasItem(activeItem.id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: `1px solid ${T.border}`,
                            background: 'none',
                            color: T.textMuted,
                            cursor: 'pointer',
                          }}
                          title="Remove"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Image view ─────────────────────────────────── */
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {activeItem.imageUrl ? (
                          <div>
                            <img
                              src={activeItem.imageUrl}
                              alt={activeItem.imagePrompt || 'Generated image'}
                              style={{ width: '100%', borderRadius: 8, border: `1px solid ${T.border}` }}
                            />
                            {activeItem.imagePrompt && (
                              <p style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic', marginTop: 8 }}>{activeItem.imagePrompt}</p>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 200,
                            borderRadius: 8,
                            border: `1px dashed ${T.border}`,
                            background: T.bgInput,
                          }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 28, marginBottom: 8, animation: 'pulse 2s infinite' }}>*</div>
                              <p style={{ fontSize: 13, color: T.textMuted }}>
                                {activeItem.content || 'Generating image...'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                        {activeItem.imageUrl && (
                          <a
                            href={activeItem.imageUrl}
                            download={`ava-image-${Date.now()}.png`}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              padding: '8px 0',
                              borderRadius: 8,
                              background: T.purpleBg,
                              color: T.white,
                              fontSize: 13,
                              fontWeight: 500,
                              textDecoration: 'none',
                            }}
                          >
                            Download
                          </a>
                        )}
                        <button
                          onClick={() => removeCanvasItem(activeItem.id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: `1px solid ${T.border}`,
                            background: 'none',
                            color: T.textMuted,
                            cursor: 'pointer',
                          }}
                          title="Remove"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* ── Empty state ─────────────────────────────────── */
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>
                        {canvasTab === 'posts' ? String.fromCodePoint(0x1F4DD) : String.fromCodePoint(0x1F3A8)}
                      </div>
                      <p style={{ fontSize: 13, color: T.textMuted }}>
                        {canvasTab === 'posts'
                          ? 'Ask Ava to write a post, tweet, or article'
                          : 'Ask Ava to generate an image or graphic'
                        }
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Library tab ────────────────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {libraryLoading ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: `2px solid ${T.border}`, borderTopColor: T.accent,
                      animation: 'spin 1s linear infinite',
                    }} />
                  </div>
                ) : libraryAssets.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>{String.fromCodePoint(0x1F4C2)}</div>
                      <p style={{ fontSize: 13, color: T.textMuted }}>No saved assets yet</p>
                      <p style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Generated images are saved here automatically</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Selected asset preview */}
                    {selectedAssetId && (() => {
                      const asset = libraryAssets.find(a => a.id === selectedAssetId);
                      if (!asset) return null;
                      return (
                        <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
                          <img
                            src={asset.public_url}
                            alt={asset.prompt || 'Asset'}
                            style={{ width: '100%', borderRadius: 8, border: `1px solid ${T.border}`, maxHeight: 200, objectFit: 'contain', background: 'rgba(0,0,0,0.2)' }}
                          />
                          {asset.prompt && (
                            <p style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic', marginTop: 8, overflow: 'hidden', maxHeight: '2.8em', lineHeight: '1.4em' }}>
                              {asset.prompt}
                            </p>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <a
                              href={asset.public_url}
                              download
                              style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: '6px 0',
                                borderRadius: 8,
                                background: T.purpleBg,
                                color: T.white,
                                fontSize: 12,
                                fontWeight: 500,
                                textDecoration: 'none',
                              }}
                            >
                              Download
                            </a>
                            <button
                              onClick={() => { navigator.clipboard.writeText(asset.public_url); }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: `1px solid ${T.border}`,
                                background: 'none',
                                color: T.textMuted,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Copy URL
                            </button>
                            <button
                              onClick={() => deleteAsset(asset.id)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: `1px solid ${T.border}`,
                                background: 'none',
                                color: T.textMuted,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Asset grid */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {libraryAssets.map(asset => (
                          <button
                            key={asset.id}
                            onClick={() => setSelectedAssetId(selectedAssetId === asset.id ? null : asset.id)}
                            style={{
                              position: 'relative',
                              aspectRatio: '1',
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: `1px solid ${selectedAssetId === asset.id ? T.accent : T.border}`,
                              background: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              ...(selectedAssetId === asset.id && { boxShadow: `0 0 0 1px ${T.accent}40` }),
                            }}
                          >
                            <img
                              src={asset.public_url}
                              alt={asset.prompt || ''}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div style={{
                              position: 'absolute',
                              bottom: 0, left: 0, right: 0,
                              background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                              padding: 6,
                            }}>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
                                {new Date(asset.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{libraryAssets.length} asset{libraryAssets.length !== 1 ? 's' : ''}</span>
                      <button
                        onClick={loadLibrary}
                        style={{ fontSize: 11, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Refresh
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Keyframe animations (injected once) ──────────────────────── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.borderHi}; }
      `}</style>
    </div>
  );
}
