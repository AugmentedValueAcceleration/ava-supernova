// Builds the per-turn system prompt. Previously an instance method on AvaViewProvider;
// extracted to a pure async function that takes its dependencies explicitly so it is
// testable and independently maintainable. Call sites pass the live state they hold.

import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import {
  AVA_HOME,
  buildSystemPrompt,
  loadPersonality,
} from '@ava/core';
import type {
  TaskManager,
  JournalManager,
  ModelDefinition,
  PermissionMode,
  DecisionsState,
} from '@ava/core';
import type { AccountInfo } from './dashboard-message-types.js';

export interface SystemPromptContext {
  cachedAccount: AccountInfo | null;
  /** Retained for future use — currently unused downstream. */
  taskManager?: TaskManager;
  /** Retained for future use — currently unused downstream. */
  journalManager?: JournalManager;
  projectInstructions?: string;
  projectRoot?: string;
  decisionsState?: DecisionsState;
  activeModelDef?: ModelDefinition;
  currentLocale: string;
  permissionMode: PermissionMode;
  /** Sink for non-fatal diagnostics. */
  log: (message: string) => void;
}

export async function buildCurrentSystemPrompt(ctx: SystemPromptContext): Promise<string> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const cfg = vscode.workspace.getConfiguration('ava-supernova');
  const isAdmin = ctx.cachedAccount?.tier === 'admin';

  // Detect if workspace is the Ava monorepo — let Ava read her own source.
  let sourceRoot: string | undefined;
  const join = require('node:path').join;
  if (existsSync(join(cwd, 'packages/core/src/agent/agent.ts'))) {
    sourceRoot = cwd;
  }

  ctx.log(`System prompt build — userName: ${ctx.cachedAccount?.name || ctx.cachedAccount?.email?.split('@')[0] || 'none'}, isAdmin: ${isAdmin}, sourceRoot: ${sourceRoot || 'none'}`);

  // Personality (optional — silent fallback to default).
  let personality;
  try {
    personality = await loadPersonality(AVA_HOME);
  } catch { /* non-fatal */ }

  // Knowledge packs removed in v0.59.2 — frontier models cover the
  // builtin domain content from training, the auto-activated injection
  // added silent token cost after the chat-tier rebalance, and the
  // manual toggle was used by ~nobody. The ~/.ava/knowledge-enabled.json
  // file (if present from a prior install) is now ignored; harmless.

  return buildSystemPrompt({
    cwd,
    platform: process.platform,
    shell: 'bash',
    permissionMode: ctx.permissionMode,
    supportsVision: ctx.activeModelDef?.supportsVision,
    projectInstructions: ctx.projectInstructions,
    autoMemory: cfg.get<boolean>('preferences.autoMemory') ?? true,
    language: ctx.currentLocale,
    userName: ctx.cachedAccount?.name || ctx.cachedAccount?.email?.split('@')[0],
    userEmail: ctx.cachedAccount?.email,
    isAdmin,
    sourceRoot,
    personality,
    decisionsContext: ctx.decisionsState?.context ?? undefined,
    decisionsFolderExists: ctx.decisionsState?.hasFolder ?? false,
    decisionsOptInStatus: ctx.decisionsState?.optInStatus ?? 'not-asked',
  });
}
