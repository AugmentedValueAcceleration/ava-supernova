import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { ToolCall, TokenUsage } from '@ava/core';
import { t, APP_DISPLAY_NAME, ProviderError } from '@ava/core';
import { THEME } from './theme.js';

const marked = new Marked(markedTerminal() as Record<string, unknown>);

export class Renderer {
  private streamBuffer = '';
  private streamLineCount = 0;
  private thinkingBuffer = '';
  private isThinking = false;

  printWelcome(): void {
    console.log('');
    console.log(chalk.hex(THEME.accent).bold(`  ${APP_DISPLAY_NAME}`));
    console.log(chalk.dim('  ' + t('welcome.cli_hint')));
    console.log('');
  }

  streamThinking(delta: string): void {
    if (!this.isThinking) {
      this.isThinking = true;
      process.stdout.write(chalk.dim.italic('\n  ' + t('cli.thinking_label')));
    }
    this.thinkingBuffer += delta;
    // Show a condensed version — just dots for progress
    process.stdout.write(chalk.dim('.'));
  }

  private endThinking(): void {
    if (this.isThinking) {
      this.isThinking = false;
      const words = this.thinkingBuffer.split(/\s+/).length;
      process.stdout.write(chalk.dim(` (${t('cli.thinking_words', { count: String(words) })})\n`));
      this.thinkingBuffer = '';
    }
  }

  streamText(delta: string): void {
    this.endThinking();
    this.streamBuffer += delta;
    this.streamLineCount += (delta.match(/\n/g) || []).length;
    process.stdout.write(delta);
  }

  endStream(): void {
    this.endThinking();
    if (!this.streamBuffer) return;

    const hasMarkdown = /```[\s\S]*```|^#{1,6}\s|^\*\*|^- |\|.*\|/m.test(this.streamBuffer);

    if (hasMarkdown) {
      process.stdout.write('\r');
      for (let i = 0; i <= this.streamLineCount; i++) {
        process.stdout.write('\x1b[2K');
        if (i < this.streamLineCount) {
          process.stdout.write('\x1b[1A');
        }
      }
      process.stdout.write('\r');

      const rendered = marked.parse(this.streamBuffer) as string;
      process.stdout.write(rendered);
    } else {
      process.stdout.write('\n');
    }

    this.streamBuffer = '';
    this.streamLineCount = 0;
  }

  printToolCallStart(toolCall: ToolCall): void {
    // todo_write is rendered entirely by printToolCallResult — skip the noisy start line
    if (toolCall.function.name === 'todo_write') return;

    console.log('');
    console.log(
      chalk.hex(THEME.toolAccent)('  ' + t('cli.tool_label')) +
        chalk.bold(toolCall.function.name) +
        chalk.dim(` (${this.truncateArgs(toolCall.function.arguments)})`),
    );
  }

  printToolCallResult(toolCall: ToolCall, result: string, success: boolean, metadata?: Record<string, unknown>): void {
    // Pretty-print todo_write as a visual task list
    if (toolCall.function.name === 'todo_write' && success) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const todos = args.todos as Array<{ content: string; status: string; activeForm: string }>;
        const done = todos.filter((t) => t.status === 'completed').length;
        console.log('');
        console.log(
          chalk.hex(THEME.toolAccent)('  ' + t('cli.tasks_label')) +
            chalk.dim(t('todo.done', { done: String(done), total: String(todos.length) })),
        );
        for (const t of todos) {
          const icon =
            t.status === 'completed'
              ? chalk.green('\u2713')
              : t.status === 'in_progress'
                ? chalk.hex(THEME.accent)('~')
                : chalk.dim('\u25CB');
          const text = t.status === 'in_progress' ? t.activeForm : t.content;
          const style = t.status === 'completed' ? chalk.dim : (s: string) => s;
          console.log(`    ${icon} ${style(text)}`);
        }
        return;
      } catch {
        // fall through to default output
      }
    }

    const status = success ? chalk.green(t('cli.ok')) : chalk.red(t('cli.fail'));
    const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
    console.log(chalk.dim(`  [${status}] ${preview.split('\n')[0]}`));

    if (toolCall.function.name === 'file_edit' && success && metadata?.oldString && metadata?.newString) {
      this.printDiff(metadata.oldString as string, metadata.newString as string);
    }
  }

  private printDiff(oldStr: string, newStr: string): void {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    const maxLines = 10;

    const removals = oldLines.slice(0, maxLines);
    const additions = newLines.slice(0, maxLines);

    for (const line of removals) {
      console.log(chalk.red(`    - ${line}`));
    }
    if (oldLines.length > maxLines) {
      console.log(chalk.red(chalk.dim('    ' + t('cli.more_lines', { count: String(oldLines.length - maxLines) }))));
    }
    for (const line of additions) {
      console.log(chalk.green(`    + ${line}`));
    }
    if (newLines.length > maxLines) {
      console.log(chalk.green(chalk.dim('    ' + t('cli.more_lines', { count: String(newLines.length - maxLines) }))));
    }
  }

  printError(error: Error): void {
    if (error instanceof ProviderError) {
      console.error(chalk.red(`\n  ${error.humanMessage}\n`));
    } else {
      console.error(chalk.red(`\n  Error: ${error.message}\n`));
    }
  }

  printUsage(usage: TokenUsage, cost?: number): void {
    const parts = [
      `${usage.prompt_tokens} ${t('status.in')}`,
      `${usage.completion_tokens} ${t('status.out')}`,
      `${usage.total_tokens} ${t('status.total')}`,
    ];
    if (cost !== undefined && cost > 0) {
      parts.push(`$${cost.toFixed(6)}`);
    }
    console.log(chalk.dim('  ' + t('cli.tokens_label') + ' ' + parts.join(' / ')));
  }

  private truncateArgs(argsJson: string): string {
    if (argsJson.length > 80) return argsJson.slice(0, 80) + '...';
    return argsJson;
  }
}
