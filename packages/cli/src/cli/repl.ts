import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import type { Agent, AgentEvent, Conversation, ToolRegistry } from '@ava/core';
import { Renderer } from './renderer.js';
import { CommandHandler } from './commands.js';
import { Spinner } from './spinner.js';
import { THEME } from './theme.js';

export class Repl {
  private rl: readline.Interface;
  private renderer: Renderer;
  private commands!: CommandHandler;
  private spinner: Spinner;
  private agent: Agent;
  private conversation: Conversation;
  private closed = false;
  private modelLabel: string;
  private multilineBuffer: string[] = [];
  private inMultiline = false;

  constructor(opts: {
    agent: Agent;
    conversation: Conversation;
    toolRegistry: ToolRegistry;
    modelLabel: string;
  }) {
    this.agent = opts.agent;
    this.conversation = opts.conversation;
    this.renderer = new Renderer();
    this.spinner = new Spinner();
    this.modelLabel = opts.modelLabel;

    this.rl = readline.createInterface({
      input: stdin,
      output: stdout,
      prompt: this.buildPrompt(),
    });

    this.rl.on('close', () => {
      this.closed = true;
    });

    opts.toolRegistry.setConfirmationHandler(
      (toolName, args) => this.askConfirmation(toolName, args),
    );
  }

  setModelLabel(label: string): void {
    this.modelLabel = label;
    this.rl.setPrompt(this.buildPrompt());
  }

  private buildPrompt(): string {
    return `\n${chalk.hex(THEME.accent)(this.modelLabel)} ${chalk.dim('>')} `;
  }

  private askConfirmation(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      this.spinner.stop();

      const summary = this.formatToolSummary(toolName, args);
      console.log('');
      console.log(
        chalk.hex(THEME.toolAccent)('  [confirm] ') +
        chalk.bold(toolName) +
        chalk.dim(` — ${summary}`),
      );

      const confirmRl = readline.createInterface({
        input: stdin,
        output: stdout,
      });

      confirmRl.question(
        chalk.hex(THEME.toolAccent)('  Allow? ') + chalk.dim('(y/n) '),
        (answer) => {
          confirmRl.close();
          const approved = answer.trim().toLowerCase().startsWith('y');
          if (!approved) {
            console.log(chalk.dim('  Denied.'));
          }
          resolve(approved);
        },
      );
    });
  }

  private formatToolSummary(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'bash':
        return String(args.command ?? '').slice(0, 80);
      case 'file_write':
        return `write to ${args.file_path}`;
      case 'file_edit':
        return `edit ${args.file_path}`;
      default:
        return JSON.stringify(args).slice(0, 80);
    }
  }

  setAgent(agent: Agent): void {
    this.agent = agent;
  }

  setCommands(commands: CommandHandler): void {
    this.commands = commands;
  }

  private prompt(): void {
    if (!this.closed) {
      this.rl.prompt();
    }
  }

  private continuationPrompt(): string {
    return chalk.dim('  ... ');
  }

  async start(): Promise<void> {
    this.renderer.printWelcome();
    this.prompt();

    for await (const line of this.rl) {
      // Handle triple-quote multiline blocks
      if (!this.inMultiline && line.trim().startsWith('"""')) {
        this.inMultiline = true;
        const rest = line.trim().slice(3);
        if (rest) this.multilineBuffer.push(rest);
        this.rl.setPrompt(this.continuationPrompt());
        this.prompt();
        continue;
      }

      if (this.inMultiline) {
        if (line.trim().endsWith('"""')) {
          const rest = line.trim().slice(0, -3);
          if (rest) this.multilineBuffer.push(rest);
          this.inMultiline = false;
          const input = this.multilineBuffer.join('\n');
          this.multilineBuffer = [];
          this.rl.setPrompt(this.buildPrompt());

          if (input.trim()) {
            await this.processUserMessage(input);
          }
          this.prompt();
          continue;
        }
        this.multilineBuffer.push(line);
        this.prompt();
        continue;
      }

      // Handle backslash continuation
      if (line.endsWith('\\')) {
        this.multilineBuffer.push(line.slice(0, -1));
        this.rl.setPrompt(this.continuationPrompt());
        this.prompt();
        continue;
      }

      // If we had backslash-continued lines, finalize
      if (this.multilineBuffer.length > 0) {
        this.multilineBuffer.push(line);
        const input = this.multilineBuffer.join('\n').trim();
        this.multilineBuffer = [];
        this.rl.setPrompt(this.buildPrompt());

        if (input) {
          if (input.startsWith('/')) {
            const shouldContinue = await this.commands.handle(input);
            if (!shouldContinue) {
              this.rl.close();
              return;
            }
          } else {
            await this.processUserMessage(input);
          }
        }
        this.prompt();
        continue;
      }

      const input = line.trim();
      if (!input) {
        this.prompt();
        continue;
      }

      if (input.startsWith('/')) {
        const shouldContinue = await this.commands.handle(input);
        if (!shouldContinue) {
          this.rl.close();
          return;
        }
        this.prompt();
        continue;
      }

      await this.processUserMessage(input);
      this.prompt();
    }
  }

  private async processUserMessage(input: string): Promise<void> {
    this.conversation.addUserMessage(input);

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case 'stream_start':
          this.spinner.stop();
          break;
        case 'stream_delta':
          this.renderer.streamText(event.content);
          break;
        case 'stream_end':
          this.renderer.endStream();
          break;
        case 'tool_call_start':
          this.renderer.printToolCallStart(event.toolCall);
          this.spinner.start(`Running ${event.toolCall.function.name}...`);
          break;
        case 'tool_call_end':
          this.spinner.stop();
          this.renderer.printToolCallResult(event.toolCall, event.result, event.success, event.metadata);
          break;
        case 'usage':
          this.renderer.printUsage(event.usage, event.cost);
          break;
        case 'error':
          this.spinner.stop();
          this.renderer.printError(event.error);
          break;
        case 'done':
          break;
      }
    };

    this.spinner.start('Thinking...');

    try {
      const updatedMessages = await this.agent.run(this.conversation.getMessages(), onEvent);
      this.conversation.setMessages(updatedMessages);
    } catch (error) {
      this.spinner.stop();
      this.renderer.printError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
