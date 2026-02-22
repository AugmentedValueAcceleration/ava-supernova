import { useMemo } from 'react';
import type { WebviewToExtMessage } from '../types/messages';

interface VSCodeApi {
  postMessage(message: WebviewToExtMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

// acquireVsCodeApi can only be called once
const vscodeApi = acquireVsCodeApi();

export function useVSCodeApi() {
  // Stable reference — prevents useEffect dependency loops
  return useMemo(() => ({
    postMessage: (message: WebviewToExtMessage) => vscodeApi.postMessage(message),
    getState: () => vscodeApi.getState(),
    setState: (state: unknown) => vscodeApi.setState(state),
  }), []);
}
