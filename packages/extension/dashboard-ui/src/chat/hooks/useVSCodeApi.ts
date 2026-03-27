import { useMemo } from 'react';
import { vscode, post } from '../../vscode';
import type { DashboardToExtMessage } from '../../types/messages';

export function useVSCodeApi() {
  return useMemo(() => ({
    postMessage: (message: DashboardToExtMessage) => post(message),
    getState: () => vscode.getState(),
    setState: (state: unknown) => vscode.setState(state),
  }), []);
}
