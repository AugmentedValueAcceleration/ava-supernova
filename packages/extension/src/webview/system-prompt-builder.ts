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

  // Manually enabled knowledge packs.
  // Auto-detection (game/app projects) was removed: native coding ability is
  // stronger than pre-loaded framework dumps; packs consumed context that
  // should go to reading code and reasoning.
  let knowledgeContext: string | undefined;
  try {
    const fs = require('node:fs');
    const { BUILTIN_PACKS } = require('@ava/core');
    const packSections: string[] = [];
    try {
      const enabledPath = require('node:path').join(AVA_HOME, 'knowledge-enabled.json');
      if (fs.existsSync(enabledPath)) {
        const loadedIds = new Set<string>();
        const enabledIds: string[] = JSON.parse(fs.readFileSync(enabledPath, 'utf-8'));
        for (const id of enabledIds) {
          if (loadedIds.has(id)) continue;
          const pack = BUILTIN_PACKS?.find((p: { id: string }) => p.id === id);
          if (pack) {
            packSections.push(`## Knowledge Pack: ${pack.name}\n\n${pack.context}`);
            loadedIds.add(id);
          }
        }
      }
    } catch { /* no enabled packs file */ }
    if (packSections.length > 0) {
      knowledgeContext = packSections.join('\n\n');
    }
  } catch { /* non-fatal */ }

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
    knowledgeContext,
    decisionsContext: ctx.decisionsState?.context ?? undefined,
    decisionsFolderExists: ctx.decisionsState?.hasFolder ?? false,
    decisionsOptInStatus: ctx.decisionsState?.optInStatus ?? 'not-asked',
    excludeTools: ['screenshot', 'computer_use'],
  });
}
