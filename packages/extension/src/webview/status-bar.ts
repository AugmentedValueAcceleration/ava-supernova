// Owns the VS Code status bar item that shows Ava's current model and run state.
// Extracted from AvaViewProvider — no cross-dependencies, just a small stateful class.

import * as vscode from 'vscode';
import type { ModelDefinition } from '@ava/core';

export type StatusBarState = 'ready' | 'busy' | 'error' | 'generating';

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private modelDef?: ModelDefinition;
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
    const modelName = this.modelDef?.name || 'No model';
    switch (this.state) {
      case 'busy':
        this.item.text = `$(loading~spin) Ava: ${modelName}`;
        break;
      case 'error':
        this.item.text = `$(error) Ava: ${modelName}`;
        break;
      case 'generating':
        this.item.text = `$(loading~spin) Ava: ${this.detail ?? modelName}`;
        break;
      default:
        this.item.text = `$(sparkle) Ava: ${modelName}`;
    }
    this.item.tooltip = `Ava Supernova — ${modelName}\nClick to switch model`;
  }
}
