import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { ToolCall, TokenUsage } from '../core/types.js';
import { APP_DISPLAY_NAME } from '../core/constants.js';
import { ProviderError } from '../core/errors.js';
import { THEME } from './theme.js';

const marked = new Marked(markedTerminal() as Record<string, unknown>);

export class Renderer {
  private streamBuffer = '';
  private streamLineCount = 0;

  printWelcome(): void {
    console.log('');
    console.log(chalk.hex(THEME.accent).bold(`  ${APP_DISPLAY_NAME}`));
    console.log(chalk.dim('  Type your message, or /help for commands.'));
    console.log('');
  }

  streamText(delta: string): void {
    this.streamBuffer += delta;
    this.streamLineCount += (delta.match(/\n/g) || []).length;
    process.stdout.write(delta);
  }

  endStream(): void {
    if (!this.streamBuffer) return;

    const hasMarkdown = /```[\s\S]*```|^#{1,6}\s|^\*\*|^\- |\|.*\|/m.test(this.streamBuffer);

    if (hasMarkdown) {
      // Clear the raw streamed output
      process.stdout.write('\r');
      for (let i = 0; i <= this.streamLineCount; i++) {
        process.stdout.write('\x1b[2K'); // Clear line
        if (i < this.streamLineCount) {
          process.stdout.write('\x1b[1A'); // Move up
        }
      }
      process.stdout.write('\r');

      // Re-render with markdown formatting
      const rendered = marked.parse(this.streamBuffer) as string;
      process.stdout.write(rendered);
    } else {
      process.stdout.write('\n');
    }

    this.streamBuffer = '';
    this.streamLineCount = 0;
  }

  printToolCallStart(toolCall: ToolCall): void {
    console.log('');
    console.log(
      chalk.hex(THEME.toolAccent)('  [tool] ') +
        chalk.bold(toolCall.function.name) +
        chalk.dim(` (${this.truncateArgs(toolCall.function.arguments)})`),
    );
  }

  printToolCallResult(toolCall: ToolCall, result: string, success: boolean, metadata?: Record<string, unknown>): void {
    const status = success ? chalk.green('OK') : chalk.red('FAIL');
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
      console.log(chalk.red(chalk.dim(`    ... (${oldLines.length - maxLines} more lines)`)));
    }
    for (const line of additions) {
      console.log(chalk.green(`    + ${line}`));
    }
    if (newLines.length > maxLines) {
      console.log(chalk.green(chalk.dim(`    ... (${newLines.length - maxLines} more lines)`)));
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
      `${usage.prompt_tokens} in`,
      `${usage.completion_tokens} out`,
      `${usage.total_tokens} total`,
    ];
    if (cost !== undefined && cost > 0) {
      parts.push(`$${cost.toFixed(6)}`);
    }
    console.log(chalk.dim(`  [tokens] ${parts.join(' / ')}`));
  }

  private truncateArgs(argsJson: string): string {
    if (argsJson.length > 80) return argsJson.slice(0, 80) + '...';
    return argsJson;
  }
}
