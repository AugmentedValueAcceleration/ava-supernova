import ora, { type Ora } from 'ora';

export class Spinner {
  private spinner: Ora;

  constructor() {
    this.spinner = ora({ color: 'magenta' });
  }

  start(text: string): void {
    this.spinner.start(text);
  }

  stop(): void {
    if (this.spinner.isSpinning) {
      this.spinner.stop();
    }
  }

  succeed(text: string): void {
    this.spinner.succeed(text);
  }

  fail(text: string): void {
    this.spinner.fail(text);
  }
}
