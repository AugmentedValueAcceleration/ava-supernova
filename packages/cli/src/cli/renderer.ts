import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { ToolCall, TokenUsage } from '@ava/core';
import { t, APP_VERSION, ProviderError } from '@ava/core';
import { THEME } from './theme.js';

const marked = new Marked(markedTerminal() as Record<string, unknown>);

const LOGO = [
  '     \u2554\u2550\u2557 \u2566  \u2566 \u2554\u2550\u2557',
  '     \u2560\u2550\u2563 \u255A\u2557\u2554\u255D \u2560\u2550\u2563',
  '     \u2569 \u2569  \u255A\u255D  \u2569 \u2569',
];

const SEPARATOR = '\u2500'.repeat(40);
const TOOL_ICONS: Record<string, string> = {
  file_read: '\u25B6',
  file_write: '\u25C6',
  file_edit: '\u25C8',
  glob: '\u25CE',
  grep: '\u25C9',
  bash: '\u25B8',
  web_search: '\u25C7',
  list_directory: '\u25A1',
  git_status: '\u25A0',
  http_request: '\u25C7',
  present_plan: '\u25B7',
  ask_user: '\u25CB',
  todo_write: '\u25A3',
};

export class Renderer {
  private streamBuffer = '';
  private streamLineCount = 0;
  private thinkingBuffer = '';
  private isThinking = false;

  printWelcome(modelLabel?: string): void {
    const accent = chalk.hex(THEME.accent);
    const dim = chalk.dim;

    console.log('');
    for (const line of LOGO) {
      console.log(accent.bold(line));
    }
    console.log(accent('     \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
    console.log(accent.bold('      S U P E R N O V A'));
    console.log('');
    console.log(dim(`     v${APP_VERSION}`) + (modelLabel ? dim('  \u00B7  ') + chalk.hex(THEME.text)(modelLabel) : ''));
    console.log(dim('     ' + t('welcome.cli_hint')));
    console.log('');
  }

  streamThinking(delta: string): void {
    if (!this.isThinking) {
      this.isThinking = true;
      process.stdout.write(chalk.dim.italic('\n  ' + t('cli.thinking_label')));
    }
    this.thinkingBuffer += delta;
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

    const icon = TOOL_ICONS[toolCall.function.name] || '\u25B8';
    console.log('');
    console.log(chalk.dim(`  ${SEPARATOR}`));
    console.log(
      chalk.hex(THEME.toolAccent)(`  ${icon} `) +
        chalk.hex(THEME.toolAccent).bold(toolCall.function.name) +
        chalk.dim(` \u2014 ${this.truncateArgs(toolCall.function.arguments)}`),
    );
  }

  printToolCallResult(toolCall: ToolCall, result: string, success: boolean, metadata?: Record<string, unknown>): void {
    // Pretty-print todo_write as a visual task list
    if (toolCall.function.name === 'todo_write' && success) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const todos = args.todos as Array<{ content: string; status: string; activeForm: string }>;
        const done = todos.filter((td) => td.status === 'completed').length;
        console.log('');
        console.log(chalk.dim(`  ${SEPARATOR}`));
        console.log(
          chalk.hex(THEME.toolAccent)(`  \u25A3 `) +
            chalk.hex(THEME.toolAccent).bold(t('cli.tasks_label').replace(/[\[\]\s]/g, '')) +
            chalk.dim(` ${t('todo.done', { done: String(done), total: String(todos.length) })}`),
        );
        for (const td of todos) {
          const tdIcon =
            td.status === 'completed'
              ? chalk.green('\u2713')
              : td.status === 'in_progress'
                ? chalk.hex(THEME.accent)('\u25B8')
                : chalk.dim('\u25CB');
          const text = td.status === 'in_progress' ? td.activeForm : td.content;
          const style = td.status === 'completed' ? chalk.dim : (s: string) => s;
          console.log(`    ${tdIcon} ${style(text)}`);
        }
        return;
      } catch {
        // fall through to default output
      }
    }

    const status = success
      ? chalk.hex(THEME.success)('\u2713')
      : chalk.hex(THEME.error)('\u2717');
    const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
    console.log(chalk.dim(`  ${status} ${preview.split('\n')[0]}`));

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
      console.error(chalk.red(`\n  \u2717 ${error.humanMessage}\n`));
    } else {
      console.error(chalk.red(`\n  \u2717 Error: ${error.message}\n`));
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
    console.log(chalk.dim(`  ${SEPARATOR}`));
    console.log(chalk.dim('  \u25C8 ' + parts.join(' \u00B7 ')));
  }

  private truncateArgs(argsJson: string): string {
    if (argsJson.length > 80) return argsJson.slice(0, 80) + '...';
    return argsJson;
  }
}
