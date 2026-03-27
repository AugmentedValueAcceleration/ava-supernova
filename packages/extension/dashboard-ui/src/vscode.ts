// Singleton — acquireVsCodeApi() can only be called once per webview
import type { DashboardToExtMessage } from './types/messages';

declare function acquireVsCodeApi(): {
  postMessage: (msg: DashboardToExtMessage) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

export const vscode = acquireVsCodeApi();

export function post(msg: DashboardToExtMessage): void {
  vscode.postMessage(msg);
}
