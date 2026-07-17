// Owns the VS Code status bar item that shows Ava's current model and run state.
// Extracted from AvaViewProvider — no cross-dependencies, just a small stateful class.

import * as vscode from 'vscode';
import type { ModelDefinition } from '@ava/core';

export type StatusBarState = 'ready' | 'busy' | 'error' | 'generating';

/** Display labels for orchestration modes — when one is set, the
 *  status bar shows the mode name instead of the resolved coordinator's
 *  model name. Picking Aurora used to show "Ava: Mistral Medium 3.5"
 *  because Medium 3.5 is Aurora's coordinator — but Aurora actually
 *  routes across Medium 3.5 + Small 4 + Large 3 depending on the
 *  task, so showing one model name was misleading. The mode name is
 *  the honest single-string answer. */
const MODE_LABELS: Record<string, string> = {
  aurora:    'Aurora',
  supernova: 'Supernova',
  auto:      'Maestro',
};

/** One line of what each fleet actually is, for the tooltip. The status bar is
 *  the only place a user sees the fleet without opening the picker. */
const MODE_BLURB: Record<string, string> = {
  aurora:    'Mistral-only, EU-resident end to end',
  supernova: 'Polyglot — best specialist per task',
  auto:      'Single conductor, predictable cost',
};

/** VS Code hard-limits status-bar backgrounds to exactly these two theme
 *  colours — there is no brand-colour option, by design. Anything else is
 *  silently ignored, so `error` is the only state that can own the bar. */
const ERROR_BG = new vscode.ThemeColor('statusBarItem.errorBackground');

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private modelDef?: ModelDefinition;
  private modeId?: string;
  private state: StatusBarState = 'ready';
  private detail?: string;

  constructor(command: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = command;
    // Names the entry in the status bar's right-click menu, so a user can find
    // and hide it like any first-class item instead of an anonymous blob.
    this.item.name = 'Ava Supernova';
    this.render();
    this.item.show();
  }

  /** Update the active model label. Pass undefined to clear. */
  setModel(modelDef: ModelDefinition | undefined): void {
    this.modelDef = modelDef;
    this.render();
  }

  /** Update the active orchestration mode id ('aurora' / 'supernova' /
   *  'auto') so the status bar can show the mode name instead of the
   *  coordinator's model name. Pass anything else (or undefined) to
   *  fall back to the model-name display. */
  setMode(modeId: string | null | undefined): void {
    this.modeId = modeId ?? undefined;
    this.render();
  }

  /** Update the run state. `detail` is an optional extra string shown for custom states. */
  setState(state: StatusBarState, detail?: string): void {
    this.state = state;
    this.detail = detail;
    this.render();
  }

  dispose(): void {
    this.item.dispose();
  }

  private render(): void {
    const modeLabel = this.modeId ? MODE_LABELS[this.modeId] : undefined;
    const modelName = this.modelDef?.name || 'No model';
    const label = modeLabel ?? modelName;
    switch (this.state) {
      case 'busy':
        this.item.text = `$(loading~spin) Ava: ${label}`;
        break;
      case 'error':
        this.item.text = `$(error) Ava: ${label}`;
        break;
      case 'generating':
        this.item.text = `$(loading~spin) Ava: ${this.detail ?? label}`;
        break;
      default:
        this.item.text = `$(sparkle) Ava: ${label}`;
    }

    // The one styling lever VS Code actually gives us: the bar itself turns red
    // on error. Everything else (brand colour, custom background) is refused by
    // the API, so an error used to be a small icon you could scroll past.
    this.item.backgroundColor = this.state === 'error' ? ERROR_BG : undefined;

    this.item.accessibilityInformation = {
      label: `Ava Supernova, ${label}${this.state === 'error' ? ', error' : ''}`,
      role: 'button',
    };

    this.item.tooltip = this.buildTooltip(modeLabel, modelName);
  }

  /**
   * A MarkdownString rather than a plain string — the tooltip is the only part
   * of the status bar VS Code lets us design, so it does the work the bar can't:
   * bold, icons, and a rule between what's running and what to do about it.
   *
   * NOT `isTrusted`: BYOK users can set their own model display name, which
   * lands in here. Trusting the markdown would let a display name inject a
   * clickable `command:` link. The item itself is already clickable, so a
   * command link would buy nothing and cost a real injection surface.
   */
  private buildTooltip(modeLabel: string | undefined, modelName: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true); // supportThemeIcons
    md.appendMarkdown(`$(sparkle) **Ava Supernova**\n\n`);

    if (modeLabel) {
      md.appendMarkdown(`**${modeLabel}** — orchestrated\n\n`);
      const blurb = this.modeId ? MODE_BLURB[this.modeId] : undefined;
      if (blurb) md.appendMarkdown(`${blurb}\n\n`);
      // The coordinator is the honest detail the one-word label can't carry —
      // it's how you spot a fleet resolving to the wrong seat without opening
      // the picker. (It's how the Aurora/Large 3 bug surfaced.)
      md.appendMarkdown(`Coordinator: \`${modelName}\`\n\n`);
    } else {
      md.appendMarkdown(`Model: \`${modelName}\`\n\n`);
    }

    if (this.state === 'error') md.appendMarkdown(`$(error) ${this.detail || 'Something went wrong'}\n\n`);
    else if (this.state === 'busy' || this.state === 'generating') md.appendMarkdown(`$(loading~spin) ${this.detail || 'Working…'}\n\n`);

    md.appendMarkdown(`---\n\n$(arrow-swap) Click to switch model`);
    return md;
  }
}
