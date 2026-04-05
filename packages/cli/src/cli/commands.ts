import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import type {
  ProviderRegistry,
  Conversation,
  ConfigManager,
  Provider,
  ModelDefinition,
  ProviderSettings,
  ToolRegistry,
  HistoryManager,
} from '@ava/core';
import type { PermissionMode } from '@ava/core';
import { t, scaffoldProjectInstructions, detectProjectRoot, getInstructionsPath } from '@ava/core';

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (args: string) => Promise<boolean>;
}

export type ModelSwitchHandler = (provider: Provider, model: ModelDefinition) => void;
export type RetryHandler = () => void;
export type CompactHandler = () => Promise<void>;
export type SecurityHandler = (focus: string) => Promise<void>;
export type BrainstormHandler = (topic: string) => Promise<void>;

export class CommandHandler {
  private commands: Map<string, Command> = new Map();

  constructor(opts: {
    providerRegistry: ProviderRegistry;
    conversation: Conversation;
    config: ConfigManager;
    toolRegistry: ToolRegistry;
    historyManager: HistoryManager;
    onModelSwitch?: ModelSwitchHandler;
    onRetry?: RetryHandler;
    onCompact?: CompactHandler;
    onSecurity?: SecurityHandler;
    onBrainstorm?: BrainstormHandler;
  }) {
    this.registerCommand({
      name: 'help',
      aliases: ['h'],
      description: t('cmd.help.desc'),
      execute: async () => {
        const seen = new Set<string>();
        console.log('');
        for (const [, cmd] of this.commands) {
          if (seen.has(cmd.name)) continue;
          seen.add(cmd.name);
          const aliases = cmd.aliases?.map((a) => `/${a}`).join(', ') ?? '';
          console.log(
            `  ${chalk.bold(`/${cmd.name}`)}${aliases ? chalk.dim(` (${aliases})`) : ''} - ${cmd.description}`,
          );
        }
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'model',
      aliases: ['m'],
      description: t('cmd.model.desc'),
      execute: async (args) => {
        if (args) {
          const resolved = opts.providerRegistry.resolveModel(args.trim());
          if (!resolved) {
            console.log(`  ${t('cmd.model.unknown', { model: args.trim() })}`);
            return true;
          }
          await opts.config.set('activeModel', `${resolved.provider.name}:${resolved.model.id}`);

          if (opts.onModelSwitch) {
            opts.onModelSwitch(resolved.provider, resolved.model);
          }

          console.log(
            chalk.green(
              `  ${t('cmd.model.switched', { name: resolved.model.name, provider: resolved.provider.displayName })}`,
            ),
          );
        } else {
          const activeModel = await opts.config.get('activeModel');
          const models = opts.providerRegistry.listAllModels();
          console.log('');
          for (const m of models) {
            const qualifiedId = `${m.provider}:${m.id}`;
            const active = qualifiedId === activeModel ? chalk.green(` ${t('cmd.model.active')}`) : '';
            console.log(`  ${chalk.bold(qualifiedId)} - ${m.name}${active}`);
          }
          console.log('');
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'clear',
      aliases: ['c'],
      description: t('cmd.clear.desc'),
      execute: async () => {
        opts.conversation.clear();
        console.log(`  ${t('cmd.clear.done')}`);
        return true;
      },
    });

    this.registerCommand({
      name: 'provider',
      aliases: ['p'],
      description: t('cmd.provider.desc'),
      execute: async (args) => {
        const parts = args.trim().split(/\s+/);
        const action = parts[0];

        const liveProviders = ['deepseek', 'kimi', 'qwen', 'glm', 'mistral', 'anthropic', 'generic'];
        const comingSoonProviders: string[] = [];
        const allSupported = [...liveProviders, ...comingSoonProviders];
        // Config key → registry key mapping (glm config maps to zhipu provider)
        const configToRegistry: Record<string, string> = { glm: 'zhipu' };

        if (action === 'add') {
          const providerName = parts[1];

          if (!providerName || !allSupported.includes(providerName)) {
            console.log(`  ${t('cmd.provider.usage', { providers: allSupported.join('|') })}`);
            return true;
          }

          const apiKey = await this.askQuestion(`  ${t('cmd.provider.enter_key', { provider: providerName })}`);
          if (!apiKey) {
            console.log(`  ${t('cmd.provider.cancelled')}`);
            return true;
          }

          const settings: ProviderSettings = { apiKey };
          const appConfig = await opts.config.load();
          (appConfig.providers as Record<string, ProviderSettings>)[providerName] = settings;
          await opts.config.save();

          try {
            const registryKey = configToRegistry[providerName] || providerName;
            opts.providerRegistry.register(registryKey, settings);
            console.log(chalk.green(`  ${t('cmd.provider.added', { provider: providerName })}`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ${t('cmd.provider.failed', { provider: providerName, error: msg })}`));
          }
        } else {
          const appConfig = await opts.config.load();
          console.log('');
          console.log(chalk.bold(`  ${t('cmd.provider.title')}`));
          for (const name of liveProviders) {
            const configured = (appConfig.providers as Record<string, ProviderSettings | undefined>)[name];
            const status = configured?.apiKey
              ? chalk.green(t('cmd.provider.configured'))
              : chalk.dim(t('cmd.provider.not_configured'));
            console.log(`  ${chalk.bold(name)} — ${status}`);
          }
          if (comingSoonProviders.length > 0) {
            console.log(chalk.dim(`  Coming soon: ${comingSoonProviders.join(', ')}`));
          }
          console.log('');
          console.log(chalk.dim(`  ${t('cmd.provider.hint')}`));
          console.log('');
        }
        return true;
      },
    });

    // ── History commands ─────────────────────────────────────────────────────

    this.registerCommand({
      name: 'history',
      aliases: ['ls'],
      description: t('cmd.history.desc'),
      execute: async () => {
        const conversations = await opts.historyManager.listConversations();
        if (conversations.length === 0) {
          console.log(`  ${t('cmd.history.empty')}`);
          return true;
        }
        // Sort pinned first, then by updatedAt (already sorted newest-first)
        const sorted = [
          ...conversations.filter((c) => c.pinned),
          ...conversations.filter((c) => !c.pinned),
        ];
        console.log('');
        console.log(chalk.bold(`  ${t('cmd.history.title')}`));
        for (const c of sorted.slice(0, 20)) {
          const date = new Date(c.updatedAt);
          const relative = formatRelativeDate(date);
          const pin = c.pinned ? chalk.yellow(' [pinned]') : '';
          console.log(`  ${chalk.dim(c.id.slice(0, 8))} ${c.title}${pin} ${chalk.dim(`(${relative})`)}`);
        }
        if (sorted.length > 20) {
          console.log(chalk.dim(`  ${t('cmd.history.more', { count: String(sorted.length - 20) })}`));
        }
        console.log('');
        console.log(chalk.dim(`  ${t('cmd.history.hint')}`));
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'resume',
      description: t('cmd.resume.desc'),
      execute: async (args) => {
        const prefix = args.trim();
        if (!prefix) {
          console.log(`  ${t('cmd.resume.usage')}`);
          console.log(`  ${t('cmd.resume.hint')}`);
          return true;
        }

        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }

        const record = await opts.historyManager.resumeConversation(match.id);
        if (!record) {
          console.log(`  ${t('cmd.resume.failed')}`);
          return true;
        }

        opts.conversation.setMessages(record.messages);
        console.log(chalk.green(`  ${t('cmd.resume.done', { title: record.title })}`));
        console.log(chalk.dim(`  ${t('cmd.resume.count', { count: String(record.messages.length) })}`));
        return true;
      },
    });

    this.registerCommand({
      name: 'search',
      aliases: ['s'],
      description: t('cmd.search.desc'),
      execute: async (args) => {
        const query = args.trim();
        if (!query) {
          console.log(`  ${t('cmd.search.usage')}`);
          return true;
        }
        const results = await opts.historyManager.searchConversations(query);
        if (results.length === 0) {
          console.log(`  ${t('cmd.search.empty', { query })}`);
          return true;
        }
        console.log('');
        console.log(chalk.bold(`  ${t('cmd.search.title', { query })}`));
        for (const c of results.slice(0, 20)) {
          const date = new Date(c.updatedAt);
          const relative = formatRelativeDate(date);
          const pin = c.pinned ? chalk.yellow(' [pinned]') : '';
          console.log(`  ${chalk.dim(c.id.slice(0, 8))} ${c.title}${pin} ${chalk.dim(`(${relative})`)}`);
        }
        if (results.length > 20) {
          console.log(chalk.dim(`  ${t('cmd.history.more', { count: String(results.length - 20) })}`));
        }
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'delete',
      aliases: ['rm'],
      description: t('cmd.delete.desc'),
      execute: async (args) => {
        const prefix = args.trim();
        if (!prefix) {
          console.log(`  ${t('cmd.delete.usage')}`);
          console.log(`  ${t('cmd.resume.hint')}`);
          return true;
        }
        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }
        const confirm = await this.askQuestion(
          `  ${t('cmd.delete.confirm', { title: match.title, id: match.id.slice(0, 8) })}`,
        );
        if (!confirm.toLowerCase().startsWith('y')) {
          console.log(`  ${t('cmd.provider.cancelled')}`);
          return true;
        }
        const deleted = await opts.historyManager.deleteConversation(match.id);
        if (deleted) {
          console.log(chalk.green(`  ${t('cmd.delete.done')}`));
        } else {
          console.log(`  ${t('cmd.delete.failed')}`);
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'rename',
      description: t('cmd.rename.desc'),
      execute: async (args) => {
        const trimmed = args.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (!trimmed || spaceIdx === -1) {
          console.log(`  ${t('cmd.rename.usage')}`);
          return true;
        }
        const prefix = trimmed.slice(0, spaceIdx);
        const newTitle = trimmed.slice(spaceIdx + 1).trim();
        if (!newTitle) {
          console.log(`  ${t('cmd.rename.usage')}`);
          return true;
        }
        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }
        const success = await opts.historyManager.renameConversation(match.id, newTitle);
        if (success) {
          console.log(chalk.green(`  ${t('cmd.rename.done', { title: newTitle })}`));
        } else {
          console.log(`  ${t('cmd.rename.failed')}`);
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'pin',
      description: t('cmd.pin.desc'),
      execute: async (args) => {
        const prefix = args.trim();
        if (!prefix) {
          console.log(`  ${t('cmd.pin.usage')}`);
          return true;
        }
        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }
        const success = await opts.historyManager.pinConversation(match.id, true);
        if (success) {
          console.log(chalk.green(`  ${t('cmd.pin.done', { title: match.title })}`));
        } else {
          console.log(`  ${t('cmd.pin.failed')}`);
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'unpin',
      description: t('cmd.unpin.desc'),
      execute: async (args) => {
        const prefix = args.trim();
        if (!prefix) {
          console.log(`  ${t('cmd.unpin.usage')}`);
          return true;
        }
        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }
        const success = await opts.historyManager.pinConversation(match.id, false);
        if (success) {
          console.log(chalk.green(`  ${t('cmd.unpin.done', { title: match.title })}`));
        } else {
          console.log(`  ${t('cmd.unpin.failed')}`);
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'export',
      description: t('cmd.export.desc'),
      execute: async (args) => {
        const parts = args.trim().split(/\s+/);
        const prefix = parts[0];
        const format = (parts[1] === 'json' ? 'json' : 'markdown') as 'markdown' | 'json';
        if (!prefix) {
          console.log(`  ${t('cmd.export.usage')}`);
          return true;
        }
        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  ${t('cmd.resume.not_found', { prefix })}`);
          return true;
        }
        const content = await opts.historyManager.exportConversation(match.id, format);
        if (!content) {
          console.log(`  ${t('cmd.export.failed')}`);
          return true;
        }
        const ext = format === 'json' ? '.json' : '.md';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-export-${timestamp}${ext}`;
        const { writeFile } = await import('node:fs/promises');
        await writeFile(filename, content, 'utf-8');
        console.log(chalk.green(`  ${t('cmd.export.done', { filename })}`));
        return true;
      },
    });

    // ── Retry ─────────────────────────────────────────────────────────────────

    this.registerCommand({
      name: 'retry',
      aliases: ['r'],
      description: t('cmd.retry.desc'),
      execute: async () => {
        if (opts.onRetry) {
          opts.onRetry();
        } else {
          console.log(`  ${t('cmd.retry.unavailable')}`);
        }
        return true;
      },
    });

    // ── Context compression ────────────────────────────────────────────────

    this.registerCommand({
      name: 'compact',
      aliases: ['compress'],
      description: t('cmd.compact.desc'),
      execute: async () => {
        if (opts.onCompact) {
          await opts.onCompact();
        } else {
          console.log(`  ${t('cmd.compact.unavailable')}`);
        }
        return true;
      },
    });

    // ── Permission mode ──────────────────────────────────────────────────────

    this.registerCommand({
      name: 'permission',
      aliases: ['perm'],
      description: t('cmd.permission.desc'),
      execute: async (args) => {
        const modes: PermissionMode[] = ['strict', 'balanced', 'autonomous'];
        const input = args.trim().toLowerCase() as PermissionMode;

        if (!input) {
          const current = opts.toolRegistry.getPermissionMode();
          console.log('');
          console.log(chalk.bold(`  ${t('cmd.permission.title')}`));
          for (const m of modes) {
            const active = m === current ? chalk.green(` ${t('cmd.model.active')}`) : '';
            const desc = m === 'strict'
              ? t('cmd.permission.strict')
              : m === 'balanced'
                ? t('cmd.permission.balanced')
                : t('cmd.permission.autonomous');
            console.log(`  ${chalk.bold(m)} — ${desc}${active}`);
          }
          console.log('');
          return true;
        }

        if (!modes.includes(input)) {
          console.log(`  ${t('cmd.permission.unknown', { modes: modes.join(', ') })}`);
          return true;
        }

        opts.toolRegistry.setPermissionMode(input);
        console.log(chalk.green(`  ${t('cmd.permission.set', { mode: input })}`));
        return true;
      },
    });

    // ── Tools list ───────────────────────────────────────────────────────────

    this.registerCommand({
      name: 'tools',
      description: t('cmd.tools.desc'),
      execute: async () => {
        const schemas = opts.toolRegistry.getSchemas();
        console.log('');
        console.log(chalk.bold(`  ${t('cmd.tools.title')}`));
        for (const s of schemas) {
          console.log(`  ${chalk.bold(s.function.name)} — ${s.function.description.slice(0, 80)}`);
        }
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'init',
      description: t('cmd.init.desc'),
      execute: async () => {
        const cwd = process.cwd();
        const projectRoot = detectProjectRoot(cwd) ?? cwd;
        const result = await scaffoldProjectInstructions(projectRoot);
        if (result) {
          console.log(chalk.green(`  ${t('cmd.init.created', { path: result })}`));
          console.log(chalk.dim(`  ${t('cmd.init.hint')}`));
          console.log(chalk.dim(`  ${t('cmd.init.restart')}`));
        } else {
          const existing = getInstructionsPath(projectRoot);
          console.log(`  ${t('cmd.init.exists', { path: existing })}`);
        }
        return true;
      },
    });

    // ── Security scan ──────────────────────────────────────────────────────

    this.registerCommand({
      name: 'security',
      aliases: ['sec', 'audit'],
      description: t('cmd.security.desc'),
      execute: async (args) => {
        if (opts.onSecurity) {
          await opts.onSecurity(args.trim());
        } else {
          console.log(`  ${t('cmd.security.desc')}`);
        }
        return true;
      },
    });

    // ── Brainstorm ──────────────────────────────────────────────────────

    this.registerCommand({
      name: 'brainstorm',
      aliases: ['idea', 'ideas'],
      description: 'Start a brainstorm session — ideas grounded in your context',
      execute: async (args) => {
        if (opts.onBrainstorm) {
          await opts.onBrainstorm(args.trim());
        } else {
          console.log('  Brainstorm mode — start an idea generation session');
        }
        return true;
      },
    });

    this.registerCommand({
      name: 'exit',
      aliases: ['quit', 'q'],
      description: t('cmd.exit.desc'),
      execute: async () => false,
    });
  }

  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  private registerCommand(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.set(alias, cmd);
      }
    }
  }

  async handle(input: string): Promise<boolean> {
    const [cmdName, ...argParts] = input.slice(1).split(' ');
    const args = argParts.join(' ');
    const command = this.commands.get(cmdName);

    if (!command) {
      console.log(`  ${t('cmd.unknown', { input })}`);
      return true;
    }

    try {
      return await command.execute(args);
    } catch (err) {
      console.error(`  Command error: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }
  }
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t('history.just_now');
  if (minutes < 60) return t('history.minutes_ago', { n: String(minutes) });
  if (hours < 24) return t('history.hours_ago', { n: String(hours) });
  if (days < 7) return t('history.days_ago', { n: String(days) });
  return date.toLocaleDateString();
}
