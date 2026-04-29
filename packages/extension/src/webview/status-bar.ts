// Owns the VS Code status bar item that shows Ava's current model and run state.
// Extracted from AvaViewProvider — no cross-dependencies, just a small stateful class.

import * as vscode from 'vscode';
import type { ModelDefinition } from '@ava/core';

export type StatusBarState = 'ready' | 'busy' | 'error' | 'generating';

/** Display labels for orchestration modes — when one is set, the
 *  status bar shows the mode name instead of the resolved coordinator's
 *  model name. Picking Aurora used to show "Ava: Mistral Large 3"
 *  because Large 3 is Aurora's coordinator — but Aurora actually
 *  routes across Large 3 + Medium 3.5 + Small 4 depending on the
 *  task, so showing one model name was misleading. The mode name is
 *  the honest single-string answer. */
const MODE_LABELS: Record<string, string> = {
  aurora:    'Aurora',
  supernova: 'Supernova',
  auto:      'Maestro',
};

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private modelDef?: ModelDefinition;
  private modeId?: string;
  private state: StatusBarState = 'ready';
  private detail?: string;

  constructor(command: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = command;
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
    // Tooltip shows BOTH the mode and the coordinator so the operator
    // can see what Aurora actually resolves to without having to open
    // the picker. Only adds the mode line when one is set.
    this.item.tooltip = modeLabel
      ? `Ava Supernova — ${modeLabel} mode\nCoordinator: ${modelName}\nClick to switch model`
      : `Ava Supernova — ${modelName}\nClick to switch model`;
  }
}
