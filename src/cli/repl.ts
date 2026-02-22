import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import type { Agent, AgentEvent } from '../agent/agent.js';
import type { Conversation } from '../agent/conversation.js';
import { Renderer } from './renderer.js';
import { CommandHandler } from './commands.js';
import { Spinner } from './spinner.js';

export class Repl {
  private rl: readline.Interface;
  private renderer: Renderer;
  private commands!: CommandHandler;
  private spinner: Spinner;
  private agent: Agent;
  private conversation: Conversation;
  private closed = false;

  constructor(opts: {
    agent: Agent;
    conversation: Conversation;
  }) {
    this.agent = opts.agent;
    this.conversation = opts.conversation;
    this.renderer = new Renderer();
    this.spinner = new Spinner();

    this.rl = readline.createInterface({
      input: stdin,
      output: stdout,
      prompt: '\n> ',
    });

    this.rl.on('close', () => {
      this.closed = true;
    });
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

  async start(): Promise<void> {
    this.renderer.printWelcome();
    this.prompt();

    for await (const line of this.rl) {
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
          this.renderer.printToolCallResult(event.toolCall, event.result, event.success);
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
