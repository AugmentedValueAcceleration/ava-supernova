import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { THEME } from './theme.js';

const CONTEXTUAL_MESSAGES: Record<string, string[]> = {
  file_read:       ['Reading file...', 'Loading content...'],
  file_write:      ['Writing file...', 'Saving changes...'],
  file_edit:       ['Editing file...', 'Applying changes...'],
  glob:            ['Searching files...', 'Scanning project...'],
  grep:            ['Searching code...', 'Scanning contents...'],
  bash:            ['Running command...', 'Executing...'],
  web_search:      ['Searching the web...', 'Fetching results...'],
  list_directory:  ['Listing directory...'],
  git_status:      ['Checking git...'],
  http_request:    ['Making request...', 'Fetching data...'],
  present_plan:    ['Preparing plan...'],
  todo_write:      ['Updating tasks...'],
  ask_user:        ['Waiting for input...'],
};

export class Spinner {
  private spinner: Ora;

  constructor() {
    this.spinner = ora({
      color: 'magenta',
      spinner: 'dots',
      prefixText: ' ',
    });
  }

  start(text: string): void {
    this.spinner.start(chalk.hex(THEME.dim)(text));
  }

  startForTool(toolName: string): void {
    const messages = CONTEXTUAL_MESSAGES[toolName];
    const text = messages ? messages[Math.floor(Math.random() * messages.length)] : `Running ${toolName}...`;
    this.start(text);
  }

  stop(): void {
    if (this.spinner.isSpinning) {
      this.spinner.stop();
    }
  }

  succeed(text: string): void {
    this.spinner.succeed(chalk.hex(THEME.success)(text));
  }

  fail(text: string): void {
    this.spinner.fail(chalk.hex(THEME.error)(text));
  }
}
