import chalk from 'chalk';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { Conversation } from '../agent/conversation.js';
import type { ConfigManager } from '../config/config.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (args: string) => Promise<boolean>;
}

export type ModelSwitchHandler = (provider: Provider, model: ModelDefinition) => void;

export class CommandHandler {
  private commands: Map<string, Command> = new Map();

  constructor(opts: {
    providerRegistry: ProviderRegistry;
    conversation: Conversation;
    config: ConfigManager;
    onModelSwitch?: ModelSwitchHandler;
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
      name: 'exit',
      aliases: ['quit', 'q'],
      description: 'Exit Ava',
      execute: async () => false,
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
