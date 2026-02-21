import chalk from 'chalk';
import type { ToolCall } from '../core/types.js';
import { APP_DISPLAY_NAME } from '../core/constants.js';
import { THEME } from './theme.js';

export class Renderer {
  private streamBuffer = '';

  printWelcome(): void {
    console.log('');
    console.log(chalk.hex(THEME.accent).bold(`  ${APP_DISPLAY_NAME}`));
    console.log(chalk.dim('  Type your message, or /help for commands.'));
    console.log('');
  }

  streamText(delta: string): void {
    this.streamBuffer += delta;
    process.stdout.write(delta);
  }

  endStream(): void {
    if (this.streamBuffer) {
      process.stdout.write('\n');
    }
    this.streamBuffer = '';
  }

  printToolCallStart(toolCall: ToolCall): void {
    console.log('');
    console.log(
      chalk.hex(THEME.toolAccent)('  [tool] ') +
        chalk.bold(toolCall.function.name) +
        chalk.dim(` (${this.truncateArgs(toolCall.function.arguments)})`),
    );
  }

  printToolCallResult(_toolCall: ToolCall, result: string, success: boolean): void {
    const status = success ? chalk.green('OK') : chalk.red('FAIL');
    const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
    console.log(chalk.dim(`  [${status}] ${preview.split('\n')[0]}`));
  }

  printError(error: Error): void {
    console.error(chalk.red(`\n  Error: ${error.message}\n`));
  }

  private truncateArgs(argsJson: string): string {
    if (argsJson.length > 80) return argsJson.slice(0, 80) + '...';
    return argsJson;
  }
}
