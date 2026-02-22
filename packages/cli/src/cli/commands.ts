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

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (args: string) => Promise<boolean>;
}

export type ModelSwitchHandler = (provider: Provider, model: ModelDefinition) => void;
export type RetryHandler = () => void;

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
  }) {
    this.registerCommand({
      name: 'help',
      aliases: ['h'],
      description: 'Show available commands',
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
      description: 'List or switch models (/model <provider:model-id>)',
      execute: async (args) => {
        if (args) {
          const resolved = opts.providerRegistry.resolveModel(args.trim());
          if (!resolved) {
            console.log(`  Unknown model: ${args.trim()}`);
            return true;
          }
          await opts.config.set('activeModel', `${resolved.provider.name}:${resolved.model.id}`);

          if (opts.onModelSwitch) {
            opts.onModelSwitch(resolved.provider, resolved.model);
          }

          console.log(
            chalk.green(
              `  Switched to ${resolved.model.name} (${resolved.provider.displayName})`,
            ),
          );
        } else {
          const activeModel = await opts.config.get('activeModel');
          const models = opts.providerRegistry.listAllModels();
          console.log('');
          for (const m of models) {
            const qualifiedId = `${m.provider}:${m.id}`;
            const active = qualifiedId === activeModel ? chalk.green(' (active)') : '';
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
      description: 'Clear conversation history',
      execute: async () => {
        opts.conversation.clear();
        console.log('  Conversation cleared.');
        return true;
      },
    });

    this.registerCommand({
      name: 'provider',
      aliases: ['p'],
      description: 'Add or list providers (/provider add <name>)',
      execute: async (args) => {
        const parts = args.trim().split(/\s+/);
        const action = parts[0];

        if (action === 'add') {
          const providerName = parts[1];
          const supported = ['deepseek', 'kimi', 'zhipu', 'mistral'];

          if (!providerName || !supported.includes(providerName)) {
            console.log(`  Usage: /provider add <${supported.join('|')}>`);
            return true;
          }

          const apiKey = await this.askQuestion(`  Enter API key for ${providerName}: `);
          if (!apiKey) {
            console.log('  Cancelled.');
            return true;
          }

          const settings: ProviderSettings = { apiKey };
          const appConfig = await opts.config.load();
          (appConfig.providers as Record<string, ProviderSettings>)[providerName] = settings;
          await opts.config.save();

          try {
            opts.providerRegistry.register(providerName, settings);
            console.log(chalk.green(`  Provider ${providerName} added successfully.`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  Failed to register ${providerName}: ${msg}`));
          }
        } else {
          const appConfig = await opts.config.load();
          console.log('');
          console.log(chalk.bold('  Configured providers:'));
          const supported = ['deepseek', 'kimi', 'zhipu', 'mistral'];
          for (const name of supported) {
            const configured = (appConfig.providers as Record<string, ProviderSettings | undefined>)[name];
            const status = configured?.apiKey
              ? chalk.green('configured')
              : chalk.dim('not configured');
            console.log(`  ${chalk.bold(name)} — ${status}`);
          }
          console.log('');
          console.log(chalk.dim('  Use /provider add <name> to add a provider.'));
          console.log('');
        }
        return true;
      },
    });

    // ── History commands ─────────────────────────────────────────────────────

    this.registerCommand({
      name: 'history',
      aliases: ['ls'],
      description: 'List saved conversations',
      execute: async () => {
        const conversations = await opts.historyManager.listConversations();
        if (conversations.length === 0) {
          console.log('  No saved conversations.');
          return true;
        }
        console.log('');
        console.log(chalk.bold('  Saved conversations:'));
        for (const c of conversations.slice(0, 20)) {
          const date = new Date(c.updatedAt);
          const relative = formatRelativeDate(date);
          console.log(`  ${chalk.dim(c.id.slice(0, 8))} ${c.title} ${chalk.dim(`(${relative})`)}`);
        }
        if (conversations.length > 20) {
          console.log(chalk.dim(`  ... and ${conversations.length - 20} more`));
        }
        console.log('');
        console.log(chalk.dim('  Use /resume <id-prefix> to load a conversation.'));
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'resume',
      description: 'Resume a saved conversation (/resume <id-prefix>)',
      execute: async (args) => {
        const prefix = args.trim();
        if (!prefix) {
          console.log('  Usage: /resume <id-prefix>');
          console.log('  Run /history to see available conversations.');
          return true;
        }

        const conversations = await opts.historyManager.listConversations();
        const match = conversations.find((c) => c.id.startsWith(prefix));
        if (!match) {
          console.log(`  No conversation found matching "${prefix}".`);
          return true;
        }

        const record = await opts.historyManager.resumeConversation(match.id);
        if (!record) {
          console.log('  Failed to load conversation.');
          return true;
        }

        opts.conversation.setMessages(record.messages);
        console.log(chalk.green(`  Resumed: ${record.title}`));
        console.log(chalk.dim(`  ${record.messages.length} messages loaded.`));
        return true;
      },
    });

    // ── Retry ─────────────────────────────────────────────────────────────────

    this.registerCommand({
      name: 'retry',
      aliases: ['r'],
      description: 'Retry the last message',
      execute: async () => {
        if (opts.onRetry) {
          opts.onRetry();
        } else {
          console.log('  Retry not available.');
        }
        return true;
      },
    });

    // ── Permission mode ──────────────────────────────────────────────────────

    this.registerCommand({
      name: 'permission',
      aliases: ['perm'],
      description: 'View or set permission mode (/permission <strict|balanced|autonomous>)',
      execute: async (args) => {
        const modes: PermissionMode[] = ['strict', 'balanced', 'autonomous'];
        const input = args.trim().toLowerCase() as PermissionMode;

        if (!input) {
          const current = opts.toolRegistry.getPermissionMode();
          console.log('');
          console.log(chalk.bold('  Permission mode:'));
          for (const m of modes) {
            const active = m === current ? chalk.green(' (active)') : '';
            const desc = m === 'strict'
              ? 'confirm writes and shell commands'
              : m === 'balanced'
                ? 'auto-approve writes, confirm shell commands'
                : 'auto-approve everything';
            console.log(`  ${chalk.bold(m)} — ${desc}${active}`);
          }
          console.log('');
          return true;
        }

        if (!modes.includes(input)) {
          console.log(`  Unknown mode. Choose: ${modes.join(', ')}`);
          return true;
        }

        opts.toolRegistry.setPermissionMode(input);
        console.log(chalk.green(`  Permission mode set to ${input}.`));
        return true;
      },
    });

    // ── Tools list ───────────────────────────────────────────────────────────

    this.registerCommand({
      name: 'tools',
      description: 'List available tools',
      execute: async () => {
        const schemas = opts.toolRegistry.getSchemas();
        console.log('');
        console.log(chalk.bold('  Available tools:'));
        for (const s of schemas) {
          console.log(`  ${chalk.bold(s.function.name)} — ${s.function.description.slice(0, 80)}`);
        }
        console.log('');
        return true;
      },
    });

    this.registerCommand({
      name: 'exit',
      aliases: ['quit', 'q'],
      description: 'Exit Ava',
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
      console.log(`  Unknown command: ${input}. Type /help for available commands.`);
      return true;
    }

    return command.execute(args);
  }
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
