/**
 * Ava as an ACP agent — what Unreal Editor's Assistant panel talks to (plan
 * 2026-11-18-unreal, Phase 2). Every behaviour here comes from Phase 0 on his
 * editor (scratchpad/acp-probe), recorded in the plan:
 *
 *  - initialize: protocol 1; Unreal offers no file or terminal access, so Ava
 *    uses her own tools.
 *  - session/new: `cwd` is the open project's folder; `mcpServers` hands over
 *    the editor's own server ("unreal-mcp", http://127.0.0.1:8000/mcp).
 *  - The first prompt of a chat carries a second text block: Unreal's notes
 *    for assistants (link assets as unreal-asset:…, use its tools, All
 *    Toolsets). Later prompts don't repeat it, so Ava keeps it for the chat.
 *  - The panel shows Markdown and tool calls; not plans, images or cards. Its
 *    permission prompt has Deny / Allow Once only.
 *  - New Chat starts a new program, so one program is usually one chat.
 */

import { resolve as resolvePath } from 'node:path';
import {
  APP_VERSION,
  Conversation,
  HistoryManager,
  McpServers,
  MemorySession,
  assignedPlansContext,
  buildSystemPrompt,
  consolidateSession,
  detectProjectRoot,
  ensureUnrealServer,
  formatPlanDecision,
  getPlanModePrefix,
  getWorkModePrefix,
  getWorkTalkPrefix,
  isUserMcpTool,
  t,
  unrealInnerTool,
  UNREAL_CALL_TOOL,
  loadDecisionsState,
  loadProjectInstructions,
  memoryV4Root,
  resolveMemoryModel,
  settleUnrealServer,
  syncMcpTools,
  toolRequestInWords,
  unrealPanelPrompt,
  type AgentEvent,
  type ContentPart,
  type Message,
} from '@ava/core';
import { platform } from 'node:os';
import { AvaHost } from './ava-host.js';
import { INVALID_PARAMS, JsonRpc, RpcError } from './rpc.js';
import { toolKind, toolTitle } from './tool-title.js';

/** Her modes in the panel: the ones that reach Unreal's tools. Words in his language (core i18n). */
const MODE_IDS = ['code', 'talk', 'plan'] as const;
type PanelMode = typeof MODE_IDS[number];
const isPanelMode = (v: unknown): v is PanelMode => (MODE_IDS as readonly unknown[]).includes(v);
const modes = () => [
  { id: 'code', name: t('mode.work'), description: t('acp.mode.work_desc') },
  { id: 'talk', name: `${t('mode.work')} · ${t('input.talk')}`, description: t('acp.mode.talk_desc') },
  { id: 'plan', name: t('mode.plan'), description: t('acp.mode.plan_desc') },
];

const RESULT_CHARS = 4000;

interface Block { type?: string; text?: string; data?: string; mimeType?: string; uri?: string; resource?: { uri?: string; text?: string } }

class Session {
  readonly conversation = new Conversation();
  mode: PanelMode = 'code';
  model: string | undefined;
  /** Unreal's notes for assistants, from the chat's first message. */
  unrealNotes: string | undefined;
  prompts = 0;
  abort: AbortController | null = null;
  /** Why she can't work in this chat (Unreal too old, no keys…), said instead of running. */
  blocked: string | undefined;
  /** Said once, with her first reply (e.g. "I added Unreal to your Connections"). */
  notice: string | undefined;
  memory: MemorySession | undefined;
  /**
   * What he said "Allow for this session" to: tool names, and for Unreal's
   * call_tool the Unreal tool it names (Toolset.Tool) — so allowing Python
   * for the session never also allows deleting actors. Ends with the chat
   * (a New Chat is a new program). His call, 19 Nov.
   */
  readonly sessionAllowed = new Set<string>();
  readonly sharedState: Record<string, unknown>;

  constructor(readonly id: string, readonly root: string, readonly history: HistoryManager, base: Record<string, unknown>) {
    this.sharedState = { ...base };
  }
}

export class AcpServer {
  private host: AvaHost | null = null;
  private hostBooting: Promise<AvaHost> | null = null;
  private readonly sessions = new Map<string, Session>();
  /** The chat whose turn is running — its approvals go to its panel. */
  private active: Session | null = null;
  private mcpStarted = false;

  constructor(private readonly rpc: JsonRpc, private readonly log: (line: string) => void) {
    rpc.onRequest('initialize', (p) => this.initialize(p));
    rpc.onRequest('authenticate', () => ({}));
    rpc.onRequest('session/new', (p) => this.newSession(p));
    rpc.onRequest('session/prompt', (p) => this.prompt(p));
    rpc.onRequest('session/set_mode', (p) => this.setMode(p));
    rpc.onRequest('session/set_config_option', (p) => this.setConfigOption(p));
    rpc.onNotification('session/cancel', (p) => this.cancel(p));
  }

  private bootHost(): Promise<AvaHost> {
    if (!this.hostBooting) {
      this.hostBooting = AvaHost.boot().then((h) => {
        this.host = h;
        h.toolRegistry.setConfirmationHandler((name, args, toolCallId) => this.confirm(name, args, toolCallId));
        return h;
      });
    }
    return this.hostBooting;
  }

  // ── initialize ────────────────────────────────────────────────────────────

  private initialize(p: Record<string, unknown>) {
    // Start setting her up now: keys and settings are read while Unreal opens the chat.
    void this.bootHost().catch((e) => this.log(`Setting up failed: ${e instanceof Error ? e.message : e}`));
    const asked = typeof p.protocolVersion === 'number' ? p.protocolVersion : 1;
    return {
      protocolVersion: Math.min(asked, 1),
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: true, audio: false, embeddedContext: true },
        mcpCapabilities: { http: true, sse: false },
      },
      agentInfo: { name: 'ava', title: 'Ava', version: APP_VERSION },
      authMethods: [],
    };
  }

  // ── session/new ───────────────────────────────────────────────────────────

  private async newSession(p: Record<string, unknown>) {
    const host = await this.bootHost();
    const cwd = typeof p.cwd === 'string' && p.cwd.trim() ? resolvePath(p.cwd) : null;
    if (!cwd) throw new RpcError(INVALID_PARAMS, 'session/new needs the project folder (cwd).');
    const root = detectProjectRoot(cwd) ?? cwd;
    const history = new HistoryManager(root);
    await history.init();
    const id = `ava-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const s = new Session(id, root, history, host.baseSharedState());
    s.model = host.defaultModel();
    this.sessions.set(id, s);

    // Memory: the same ~/.ava/memory as every Ava app, for this project.
    try {
      s.memory = await MemorySession.open({ root: memoryV4Root(), projectPath: root, embeddingService: host.embeddingService });
      s.sharedState.memorySession = s.memory;
    } catch (e) {
      this.log(`Memory didn't open: ${e instanceof Error ? e.message : e}`);
    }

    if (!host.canChat) s.blocked = t('acp.no_key');
    await this.connectEditor(s, p.mcpServers);

    return {
      sessionId: id,
      modes: { currentModeId: s.mode, availableModes: modes() },
      configOptions: this.configOptions(s),
    };
  }

  /** Unreal's server, as Unreal hands it over: in his Connections (decision 4), connected, 5.9 or later. */
  private async connectEditor(s: Session, given: unknown): Promise<void> {
    const servers = Array.isArray(given) ? given as Array<Record<string, unknown>> : [];
    const unreal = servers.find((x) => typeof x.url === 'string' && (x.name === 'unreal-mcp' || /127\.0\.0\.1|localhost/.test(String(x.url))));
    for (const x of servers) if (x !== unreal) this.log(`Not used: a server Unreal handed over (${String(x.name)}).`);
    const m = McpServers.current();
    if (!this.mcpStarted) {
      this.mcpStarted = true;
      m.onChange(() => { if (this.host) syncMcpTools(this.host.toolRegistry); });
    }
    if (unreal) {
      try {
        const r = await ensureUnrealServer(String(unreal.url));
        if (r.added) s.notice = t('acp.added_unreal');
        if (r.off) s.blocked = t('acp.unreal_off');
        await m.start(s.root);
        const status = r.off ? undefined : await settleUnrealServer(r.id);
        if (status?.reason === 'unreal-old') s.blocked = t('mcp.page.status.unreal_old');
        else if (status && status.state !== 'ready') this.log(`Unreal's server is ${status.state}: ${status.message ?? ''}`);
      } catch (e) {
        this.log(`Unreal's server didn't connect: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      await m.start(s.root);
    }
    if (this.host) syncMcpTools(this.host.toolRegistry);
  }

  // ── modes and the model ───────────────────────────────────────────────────

  private configOptions(s: Session) {
    const models = this.host?.modelChoices() ?? [];
    return [
      { id: 'mode', name: t('dash.docs.col_mode'), category: 'mode', type: 'select', currentValue: s.mode,
        options: modes().map((m) => ({ value: m.id, name: m.name, description: m.description })) },
      ...(models.length ? [{ id: 'model', name: t('dash.docs.col_model'), category: 'model', type: 'select', currentValue: s.model ?? models[0].value,
        options: models.map((c) => ({ value: c.value, name: c.name, ...(c.description ? { description: c.description } : {}) })) }] : []),
    ];
  }

  private session(p: Record<string, unknown>): Session {
    const s = this.sessions.get(String(p.sessionId ?? ''));
    if (!s) throw new RpcError(INVALID_PARAMS, 'No such chat.');
    return s;
  }

  private setMode(p: Record<string, unknown>) {
    const s = this.session(p);
    if (isPanelMode(p.modeId)) s.mode = p.modeId;
    return {};
  }

  private setConfigOption(p: Record<string, unknown>) {
    const s = this.session(p);
    // Logged on purpose: in Phase 0 Unreal set the mode itself on each new chat.
    this.log(`Unreal set ${String(p.configId)} = ${String(p.value)}`);
    if (p.configId === 'mode' && isPanelMode(p.value)) s.mode = p.value;
    if (p.configId === 'model' && typeof p.value === 'string' && this.host?.modelChoices().some((c) => c.value === p.value)) s.model = p.value;
    return { configOptions: this.configOptions(s) };
  }

  private showMode(s: Session): void {
    this.update(s, { sessionUpdate: 'current_mode_update', currentModeId: s.mode });
    this.update(s, { sessionUpdate: 'config_option_update', configOptions: this.configOptions(s) });
  }

  // ── session/prompt ────────────────────────────────────────────────────────

  private update(s: Session, update: Record<string, unknown>): void {
    this.rpc.notify('session/update', { sessionId: s.id, update });
  }

  private say(s: Session, text: string): void {
    this.update(s, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
  }

  private async prompt(p: Record<string, unknown>) {
    const s = this.session(p);
    const host = await this.bootHost();
    const blocks = (Array.isArray(p.prompt) ? p.prompt : []) as Block[];
    const texts = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string);
    s.prompts++;
    // The first message's extra text is Unreal's notes, not his words.
    if (s.prompts === 1 && texts.length > 1) s.unrealNotes = texts.slice(1).join('\n\n');
    const said = (s.prompts === 1 ? texts.slice(0, 1) : texts).join('\n\n');
    const attached = blocks
      .filter((b) => b.type === 'resource' && b.resource?.text)
      .map((b) => `\n\n[Attached: ${b.resource?.uri ?? 'file'}]\n${b.resource?.text}`)
      .join('');
    const images: ContentPart[] = blocks
      .filter((b) => b.type === 'image' && b.data && b.mimeType)
      .map((b) => ({ type: 'image_url', image_url: { url: `data:${b.mimeType};base64,${b.data}` } }));

    if (s.notice) { this.say(s, `${s.notice}\n\n`); s.notice = undefined; }
    if (s.blocked) { this.say(s, s.blocked); return { stopReason: 'end_turn' }; }

    const made = host.runnerFor(s.model ?? '', s.root, s.sharedState);
    if (!made) { this.say(s, AvaHost.fleetMissing(s.model ?? '')); return { stopReason: 'end_turn' }; }

    if (s.prompts === 1 || !s.conversation.getMessages().length) await this.setSystemPrompt(s, host, made.resolved.model.supportsVision);
    const prefixed = await this.withMode(s, `${said}${attached}`);
    s.conversation.addUserMessage(images.length ? [{ type: 'text', text: prefixed }, ...images] : prefixed);

    s.abort = new AbortController();
    this.active = s;
    try {
      const updated: Message[] = await made.runner.run(s.conversation.getContextMessages(), (e) => this.onEvent(s, e), s.abort.signal);
      s.conversation.appendMessages(updated);
    } catch (e) {
      if (!s.abort.signal.aborted) this.say(s, `\n\n**${t('dash.common.error')}:** ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.active = null;
    }
    const cancelled = s.abort.signal.aborted;
    s.abort = null;
    await s.history.saveConversation(s.conversation).catch(() => {});
    return { stopReason: cancelled ? 'cancelled' : 'end_turn' };
  }

  private async setSystemPrompt(s: Session, host: AvaHost, supportsVision: boolean | undefined): Promise<void> {
    const instructions = await loadProjectInstructions(s.root).catch(() => null);
    const decisions = await loadDecisionsState(s.root).catch(() => undefined);
    const coreMemory = s.memory ? (await s.memory.sessionBlock().catch(() => '')) || undefined : undefined;
    s.conversation.setSystemPrompt(buildSystemPrompt({
      cwd: s.root,
      platform: platform(),
      shell: process.platform === 'win32' ? 'bash' : '/bin/bash',
      supportsVision,
      projectInstructions: instructions ?? undefined,
      autoMemory: host.autoMemory,
      language: host.language,
      personality: host.personality,
      userName: host.userName,
      decisionsContext: decisions?.context ?? undefined,
      decisionsFolderExists: decisions?.hasFolder ?? false,
      decisionsOptInStatus: decisions?.optInStatus ?? 'not-asked',
      coreMemory,
    }) + unrealPanelPrompt(s.unrealNotes));
  }

  /** His words, wrapped in the mode's own prompt — as the extension and the IDE do. */
  private async withMode(s: Session, text: string): Promise<string> {
    if (s.mode === 'plan') return getPlanModePrefix(text || 'What should we focus on next?', await assignedPlansContext(s.root).catch(() => undefined));
    const plans = await assignedPlansContext(s.root).catch(() => undefined);
    return s.mode === 'talk' ? getWorkTalkPrefix(text, plans) : getWorkModePrefix(text, plans);
  }

  private onEvent(s: Session, e: AgentEvent): void {
    switch (e.type) {
      case 'thinking_delta':
        this.update(s, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: e.content } });
        break;
      case 'stream_delta':
        this.say(s, e.content);
        break;
      case 'tool_call_start': {
        const args = parseArgs(e.toolCall.function.arguments);
        this.update(s, {
          sessionUpdate: 'tool_call', toolCallId: e.toolCall.id,
          title: toolTitle(e.toolCall.function.name, args), kind: toolKind(e.toolCall.function.name, args),
          status: 'in_progress', rawInput: args,
        });
        break;
      }
      case 'tool_call_end': {
        const text = e.result.length > RESULT_CHARS ? `${e.result.slice(0, RESULT_CHARS)}\n…` : e.result;
        this.update(s, {
          sessionUpdate: 'tool_call_update', toolCallId: e.toolCall.id, status: e.success ? 'completed' : 'failed',
          content: [{ type: 'content', content: { type: 'text', text } }],
        });
        break;
      }
      case 'response_truncated':
        this.say(s, `\n\n_(${t('acp.truncated')})_`);
        break;
      case 'error':
        this.say(s, `\n\n**${t('dash.common.error')}:** ${e.error.message}`);
        break;
      default:
        break;
    }
  }

  // ── approvals ─────────────────────────────────────────────────────────────

  /**
   * Ava's approval step, as the panel's permission prompt (Deny / Allow Once).
   * "Always" for one Unreal tool is set on the Connections page (decision 4).
   */
  private async confirm(name: string, args: Record<string, unknown>, toolCallId?: string) {
    const s = this.active;
    if (!s) return false;
    if (name === 'switch_mode') {
      // Her own move to another mode: the panel's dropdown follows.
      const target = String(args.target_mode ?? '');
      const next: PanelMode | null = target === 'plan' ? 'plan' : target === 'work' || target === 'code' ? 'code' : null;
      if (!next) return { approved: false as const, reason: `In Unreal's panel the modes are Code, Code · Talk and Plan; ${target || 'that mode'} is in VS Code and the Ava IDE.` };
      s.mode = next;
      this.showMode(s);
      return `Mode transition approved. Switching to ${next === 'code' ? 'work' : next} mode. Carry on in it from their next message.`;
    }
    // A plan or a mode change is a decision each time; anything else he
    // allowed for this session runs without asking again.
    const sessionKey = name === 'present_plan' ? null : sessionAllowKey(name, args);
    if (sessionKey && s.sessionAllowed.has(sessionKey)) return true;
    const title = name === 'present_plan' ? t('acp.plan_title') : toolRequestInWords(name, args);
    let outcome: { outcome?: string; optionId?: string } | undefined;
    try {
      const r = await this.rpc.request<{ outcome?: { outcome?: string; optionId?: string } }>('session/request_permission', {
        sessionId: s.id,
        toolCall: {
          toolCallId: toolCallId ?? `ask-${Date.now()}`,
          title,
          kind: toolKind(name, args),
          status: 'pending',
          rawInput: args,
        },
        // Unreal dropped an allow_always option in Phase 0, so "for this
        // session" goes as a second allow_once — Ava keeps it, not Unreal.
        options: [
          { optionId: 'allow', name: t('acp.allow_once'), kind: 'allow_once' },
          ...(sessionKey ? [{ optionId: 'allow_session', name: t('acp.allow_session'), kind: 'allow_once' }] : []),
          { optionId: 'deny', name: t('tool.deny'), kind: 'reject_once' },
        ],
      });
      outcome = r?.outcome;
    } catch (e) {
      this.log(`The permission prompt failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
    const chosen = outcome?.outcome === 'selected' ? outcome.optionId : undefined;
    const yes = chosen === 'allow' || chosen === 'allow_session';
    if (chosen === 'allow_session' && sessionKey) s.sessionAllowed.add(sessionKey);
    // The panel has no "always": an Unreal tool allowed once is offered for
    // "Always allow" on the Connections page (his call, 18 Nov).
    if (yes && isUserMcpTool(name)) await McpServers.current().noteAllowedOnce(name, args).catch(() => {});
    if (name === 'present_plan') return yes ? formatPlanDecision({}) : false;
    return yes;
  }

  private cancel(p: Record<string, unknown>): void {
    const s = this.sessions.get(String(p.sessionId ?? ''));
    s?.abort?.abort();
  }

  // ── closing ───────────────────────────────────────────────────────────────

  /** The panel closed: save each chat, and let memory tidy up (bounded). */
  async close(): Promise<void> {
    const host = this.host;
    const work = [...this.sessions.values()].map(async (s) => {
      await s.history.saveConversation(s.conversation).catch(() => {});
      if (!host || !s.memory || s.conversation.getMessages().length < 3) return;
      const made = host.runnerFor(s.model ?? '', s.root, s.sharedState);
      const model = resolveMemoryModel(host.providerRegistry, Object.keys(host.keys), made?.fleet ?? undefined, made?.fleet ? null : made?.resolved);
      if (model) await consolidateSession({ session: s.memory, messages: s.conversation.getMessages(), provider: model.provider, model: model.model }).catch(() => null);
    });
    await Promise.race([Promise.all(work), new Promise((r) => setTimeout(r, 20_000))]);
    await McpServers.current().stopAll().catch(() => {});
  }
}

/** What "Allow for this session" covers: the tool, or for Unreal's call_tool the Unreal tool it names. */
export function sessionAllowKey(name: string, args: Record<string, unknown>): string | null {
  if (isUserMcpTool(name) && name.endsWith(`_${UNREAL_CALL_TOOL}`)) {
    const inner = unrealInnerTool(args);
    return inner ? `${name}:${inner}` : null;
  }
  return name;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
