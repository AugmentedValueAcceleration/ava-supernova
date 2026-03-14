import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import { t, getSecurityModePrefix } from '@ava/core';
import type { Agent, AgentEvent, Conversation, ToolRegistry, HistoryManager } from '@ava/core';
import { Renderer } from './renderer.js';
import { CommandHandler } from './commands.js';
import { Spinner } from './spinner.js';
import { THEME } from './theme.js';

const SILENT_TOOLS = new Set(['detect_language']);

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
  private lastUserInput = '';
  private historyManager: HistoryManager;
  private runAbortController?: AbortController;

  constructor(opts: {
    agent: Agent;
    conversation: Conversation;
    toolRegistry: ToolRegistry;
    historyManager: HistoryManager;
    modelLabel: string;
  }) {
    this.agent = opts.agent;
    this.conversation = opts.conversation;
    this.historyManager = opts.historyManager;
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

  private askConfirmation(toolName: string, args: Record<string, unknown>): Promise<boolean | string> {
    // ask_user: show the question and collect free-text response
    if (toolName === 'ask_user') {
      return new Promise((resolve) => {
        this.spinner.stop();
        const question = String(args.question ?? t('cli.question_fallback'));
        console.log('');
        console.log(
          chalk.hex(THEME.accent)('  ' + t('cli.question_label') + ' ') +
          chalk.bold(question),
        );

        const askRl = readline.createInterface({
          input: stdin,
          output: stdout,
        });

        askRl.question(
          chalk.hex(THEME.accent)('  ' + t('cli.your_response')),
          (answer) => {
            askRl.close();
            const response = answer.trim();
            if (!response) {
              console.log(chalk.dim('  ' + t('cli.skipped')));
              resolve(false);
            } else {
              resolve(t('cli.user_response', { response }));
            }
          },
        );
      });
    }

    return new Promise((resolve) => {
      this.spinner.stop();

      const summary = this.formatToolSummary(toolName, args);
      console.log('');
      console.log(
        chalk.hex(THEME.toolAccent)('  ' + t('cli.confirm_label') + ' ') +
        chalk.bold(toolName) +
        chalk.dim(` — ${summary}`),
      );

      const confirmRl = readline.createInterface({
        input: stdin,
        output: stdout,
      });

      confirmRl.question(
        chalk.hex(THEME.toolAccent)(t('cli.allow_prompt')) + chalk.dim(t('cli.allow_yn')),
        (answer) => {
          confirmRl.close();
          const approved = answer.trim().toLowerCase().startsWith('y');
          if (!approved) {
            console.log(chalk.dim('  ' + t('cli.denied')));
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
        return t('cli.write_to', { path: String(args.file_path) });
      case 'file_edit':
        return t('cli.edit_file', { path: String(args.file_path) });
      case 'list_directory':
        return t('cli.list_path', { path: String(args.path) });
      case 'web_search':
        return t('cli.search_query', { query: String(args.query ?? '').slice(0, 60) });
      case 'ask_user':
        return String(args.question ?? '').slice(0, 80);
      case 'git_status':
        return `git ${args.command}${args.args ? ' ' + String(args.args).slice(0, 60) : ''}`;
      case 'http_request':
        return `${args.method ?? 'GET'} ${String(args.url ?? '').slice(0, 60)}`;
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
    this.renderer.printWelcome(this.modelLabel);
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

  getLastUserInput(): string {
    return this.lastUserInput;
  }

  async retry(): Promise<void> {
    if (this.lastUserInput) {
      await this.processUserMessage(this.lastUserInput);
      this.prompt();
    }
  }

  async compact(): Promise<void> {
    this.spinner.start(t('compression.start'));
    try {
      const messages = this.conversation.getMessages();
      const compressed = await this.agent.compressContext(messages, (event) => {
        if (event.type === 'context_compression_end') {
          this.spinner.stop();
          if (event.originalTokens > 0) {
            console.log(
              chalk.green(
                '  ' + t('compression.result', { original: String(event.originalTokens), compressed: String(event.compressedTokens) }),
              ),
            );
          } else {
            console.log('  ' + t('compression.nothing'));
          }
        }
      });
      this.conversation.setMessages(compressed);
    } catch {
      this.spinner.stop();
      console.log(chalk.red('  ' + t('compression.failed')));
    }
  }

  async securityScan(focus: string): Promise<void> {
    const userText = focus || 'Perform a comprehensive security audit of this project.';
    const prefixed = getSecurityModePrefix(userText);
    await this.processUserMessage(prefixed);
    this.prompt();
  }

  /**
   * Start listening for Escape (cancel) and typed lines (interjection)
   * while the agent is running. Returns a cleanup function.
   */
  private startRunInputListener(): () => void {
    if (!stdin.isTTY) return () => {};

    let lineBuffer = '';
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    // Pause the readline so it doesn't compete for stdin
    this.rl.pause();

    const onData = (data: Buffer) => {
      const str = data.toString();

      for (const ch of str) {
        // Escape or Ctrl+C → cancel
        if (ch === '\x1b' || ch === '\x03') {
          if (this.runAbortController) {
            this.spinner.stop();
            console.log(chalk.yellow('\n  ' + t('cli.cancelled')));
            this.runAbortController.abort();
          }
          return;
        }

        // Enter → inject interjection
        if (ch === '\r' || ch === '\n') {
          const text = lineBuffer.trim();
          lineBuffer = '';
          if (text) {
            this.agent.inject(text);
            this.conversation.addUserMessage(text);
            console.log(chalk.hex(THEME.accent)(`\n  [interjection] `) + chalk.dim(text));
          }
          return;
        }

        // Backspace
        if (ch === '\x7f' || ch === '\b') {
          lineBuffer = lineBuffer.slice(0, -1);
          return;
        }

        // Regular character — accumulate
        if (ch >= ' ') {
          lineBuffer += ch;
        }
      }
    };

    stdin.on('data', onData);

    return () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      this.rl.resume();
    };
  }

  private async processUserMessage(input: string): Promise<void> {
    this.lastUserInput = input;
    this.conversation.addUserMessage(input);

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case 'stream_start':
          this.spinner.stop();
          break;
        case 'thinking_delta':
          this.renderer.streamThinking(event.content);
          break;
        case 'stream_delta':
          this.renderer.streamText(event.content);
          break;
        case 'stream_end':
          this.renderer.endStream();
          break;
        case 'tool_call_start': {
          if (!SILENT_TOOLS.has(event.toolCall.function.name)) {
            this.renderer.printToolCallStart(event.toolCall);
            this.spinner.startForTool(event.toolCall.function.name);
          }
          break;
        }
        case 'tool_call_end': {
          if (!SILENT_TOOLS.has(event.toolCall.function.name)) {
            this.spinner.stop();
            this.renderer.printToolCallResult(event.toolCall, event.result, event.success, event.metadata);
          }
          break;
        }
        case 'usage':
          this.renderer.printUsage(event.usage, event.cost);
          break;
        case 'error':
          this.spinner.stop();
          this.renderer.printError(event.error);
          break;
        case 'context_truncated':
          console.log(chalk.yellow('  ' + t('compression.context_truncated', { count: String(event.droppedCount) })));
          break;
        case 'context_compression_start':
          this.spinner.start(t('compression.start'));
          break;
        case 'context_compression_end':
          this.spinner.stop();
          if (event.originalTokens > 0) {
            console.log(
              chalk.green(
                '  ' + t('compression.result', { original: String(event.originalTokens), compressed: String(event.compressedTokens) }),
              ),
            );
          }
          break;
        case 'interjection':
          // Already printed by the input listener
          break;
        case 'done':
          break;
      }
    };

    this.spinner.start(t('cli.thinking'));
    this.runAbortController = new AbortController();
    const cleanupListener = this.startRunInputListener();

    try {
      const updatedMessages = await this.agent.run(
        this.conversation.getMessages(),
        onEvent,
        this.runAbortController.signal,
      );
      this.conversation.setMessages(updatedMessages);
      // Auto-save after each completed turn (protects against crashes)
      await this.historyManager.saveConversation(this.conversation);
    } catch (error) {
      this.spinner.stop();
      // Don't print abort errors — they're from user cancellation
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (!isAbort) {
        this.renderer.printError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      cleanupListener();
      this.runAbortController = undefined;
    }
  }
}
