// Re-export the single-source-of-truth message types from the extension host.
// The actual types live at packages/extension/src/webview/message-types.ts
// and are resolved here via a path alias (see tsconfig.json + vite.config.ts).
// This file exists only so existing imports of "../types/messages" keep working.
// Drift is now impossible — there is exactly one definition file.
export * from '@ava-extension/messages';

// Runtime helper (lives locally because the shared types file is pure types).
export { getMessageText } from './message-helpers';
