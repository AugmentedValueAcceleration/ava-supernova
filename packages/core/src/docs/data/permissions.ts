// Canonical fact table for the permission model.
// Sourced from PRESET_CATEGORY_DEFAULTS in packages/core/src/tools/tool-registry.ts.
// Update here and in the registry together if preset defaults change.

import type { ToolCategory } from './tools.js';

export type PermissionMode = 'strict' | 'balanced' | 'autonomous' | 'custom';
export type CategoryPermission = 'always_ask' | 'first_time' | 'auto';

export interface PermissionModeFact {
  id: Exclude<PermissionMode, 'custom'>;
  displayName: string;
  summary: string;
  categories: Record<ToolCategory, CategoryPermission>;
}

export const PERMISSION_MODES: PermissionModeFact[] = [
  {
    id: 'strict',
    displayName: 'Strict',
    summary: 'Every write and dangerous tool asks first. Maximum control.',
    categories: {
      file_ops: 'first_time',
      shell: 'always_ask',
      git: 'always_ask',
      web: 'always_ask',
      media: 'first_time',
      database: 'always_ask',
      system: 'always_ask',
      documents: 'first_time',
      memory: 'auto',
      learning: 'auto',
    },
  },
  {
    id: 'balanced',
    displayName: 'Balanced',
    summary: 'Writes auto-allowed, dangerous tools still confirm. The default.',
    categories: {
      file_ops: 'auto',
      shell: 'always_ask',
      git: 'first_time',
      web: 'first_time',
      media: 'auto',
      database: 'always_ask',
      system: 'always_ask',
      documents: 'auto',
      memory: 'auto',
      learning: 'auto',
    },
  },
  {
    id: 'autonomous',
    displayName: 'Autonomous',
    summary: 'Everything auto-allowed. Plans and user questions still pause.',
    categories: {
      file_ops: 'auto',
      shell: 'auto',
      git: 'auto',
      web: 'auto',
      media: 'auto',
      database: 'auto',
      system: 'auto',
      documents: 'auto',
      memory: 'auto',
      learning: 'auto',
    },
  },
];

export const PERMISSION_LABELS: Record<CategoryPermission, string> = {
  always_ask: 'Always ask',
  first_time: 'First time only',
  auto: 'Auto-allow',
};
