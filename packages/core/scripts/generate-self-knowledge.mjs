#!/usr/bin/env node

/**
 * Generate Ava's self-knowledge pack from the live codebase.
 * Run automatically during `pnpm build` — keeps the pack in sync with code.
 *
 * Includes:
 * - File tree with descriptions for all packages
 * - Full source code for key files (interfaces, types, main classes)
 * - Class signatures and exports
 */

import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = join(__dirname, '..');
const MONOREPO_ROOT = join(CORE_ROOT, '..', '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.next', 'build', 'coverage', '.turbo', '.cache', 'locales']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.mjs']);

const PACKAGES = [
  { key: 'core', path: join(MONOREPO_ROOT, 'packages', 'core', 'src'), label: 'Core Engine (@ava/core)' },
  { key: 'cli', path: join(MONOREPO_ROOT, 'packages', 'cli', 'src'), label: 'CLI (@ava/cli)' },
  { key: 'extension', path: join(MONOREPO_ROOT, 'packages', 'extension', 'src'), label: 'VS Code Extension Host' },
  { key: 'dashboard', path: join(MONOREPO_ROOT, 'packages', 'extension', 'dashboard-ui', 'src'), label: 'Dashboard UI' },
  { key: 'companion', path: join(MONOREPO_ROOT, 'packages', 'mobile', 'src'), label: 'Companion App' },
  { key: 'ide', path: join(MONOREPO_ROOT, 'packages', 'ide', 'src'), label: 'IDE (Tauri)' },
  { key: 'sidecar', path: join(MONOREPO_ROOT, 'packages', 'ide', 'sidecar'), label: 'IDE Sidecar' },
  { key: 'platform', path: join(MONOREPO_ROOT, 'packages', 'web', 'src'), label: 'Web Platform' },
];

// Key files to include FULL source code for — these define the architecture
const KEY_FILES = [
  // Core types and interfaces — the skeleton of everything
  'packages/core/src/core/types.ts',
  'packages/core/src/providers/types.ts',
  'packages/core/src/tools/types.ts',
  'packages/core/src/config/schema.ts',
  'packages/core/src/knowledge/types.ts',
  'packages/core/src/personas/types.ts',
  'packages/core/src/tasks/types.ts',
  'packages/core/src/journal/types.ts',
  'packages/core/src/auto/types.ts',
  // Main exports — what's public
  'packages/core/src/index.ts',
  // Key class files — extract signatures only
  'packages/core/src/agent/agent.ts',
  'packages/core/src/agent/system-prompt.ts',
  'packages/core/src/agent/conversation.ts',
  'packages/core/src/auto/auto-coordinator.ts',
  'packages/core/src/auto/task-classifier.ts',
  'packages/core/src/auto/model-router.ts',
  'packages/core/src/personas/conductor.ts',
  'packages/core/src/memory/memory-manager.ts',
  'packages/core/src/providers/provider-registry.ts',
  'packages/core/src/providers/resilient-provider.ts',
  'packages/core/src/tools/tool-registry.ts',
  // Model definitions — what models exist
  'packages/core/src/providers/platform/models.ts',
  'packages/core/src/providers/minimax/models.ts',
  'packages/core/src/providers/kimi/models.ts',
  'packages/core/src/providers/qwen/models.ts',
  'packages/core/src/providers/deepseek/models.ts',
  'packages/core/src/providers/anthropic/models.ts',
  // Extension entry point
  'packages/extension/src/webview/AvaViewProvider.ts',
  // IDE sidecar
  'packages/ide/sidecar/index.mjs',
];

// For large files, extract only signatures (class/function/interface/type/const exports)
const SIGNATURE_ONLY_THRESHOLD = 300; // lines

function extractSignatures(content) {
  const lines = content.split('\n');
  if (lines.length <= SIGNATURE_ONLY_THRESHOLD) return content;

  const kept = [];
  let inBlock = false;
  let braceDepth = 0;
  let blockType = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Always keep: imports, exports, interfaces, types, class declarations, function signatures
    if (trimmed.startsWith('import ') || trimmed.startsWith('export type ') || trimmed.startsWith('export interface ')) {
      kept.push(line);
      // Include the full interface/type body
      if (trimmed.includes('{') && !trimmed.includes('}')) {
        inBlock = true;
        braceDepth = 1;
        blockType = 'interface';
      }
      continue;
    }

    if (trimmed.startsWith('export class ') || trimmed.startsWith('export function ') || trimmed.startsWith('export async function ') || trimmed.startsWith('export const ')) {
      kept.push(line);
      if (trimmed.startsWith('export class ')) {
        inBlock = true;
        braceDepth = trimmed.includes('{') ? 1 : 0;
        blockType = 'class';
      }
      continue;
    }

    // Inside a block we're tracking
    if (inBlock) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      if (blockType === 'interface') {
        // Keep full interface body
        kept.push(line);
      } else if (blockType === 'class') {
        // Keep method signatures, skip method bodies
        if (trimmed.startsWith('readonly ') || trimmed.startsWith('private readonly ') ||
            trimmed.match(/^\s*(public |private |protected )?(async )?(get |set )?[\w]+\s*\(/) ||
            trimmed.startsWith('constructor(') || trimmed.startsWith('constructor (')) {
          kept.push(line);
        }
      }

      if (braceDepth <= 0) {
        inBlock = false;
        kept.push(line);
      }
      continue;
    }

    // Keep top-level const/let/var declarations
    if (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ')) {
      if (!trimmed.includes('=>') || trimmed.length < 120) {
        kept.push(line);
      }
    }

    // Keep comments that describe sections
    if (trimmed.startsWith('// ─') || trimmed.startsWith('// ==') || trimmed.startsWith('/**')) {
      kept.push(line);
    }
  }

  return `// [Signatures extracted — ${lines.length} lines original, ${kept.length} kept]\n` + kept.join('\n');
}

async function scanDir(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth || !existsSync(dir)) return [];
  const entries = [];
  let names;
  try { names = await readdir(dir); } catch { return []; }

  for (const name of names.sort()) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const fullPath = join(dir, name);
    let s;
    try { s = await stat(fullPath); } catch { continue; }

    if (s.isDirectory()) {
      const children = await scanDir(fullPath, depth + 1, maxDepth);
      entries.push({ name, type: 'dir', children });
    } else if (CODE_EXTS.has(extname(name))) {
      let desc = '';
      try {
        const content = await readFile(fullPath, 'utf-8');
        const firstLines = content.split('\n').slice(0, 15);
        for (const line of firstLines) {
          const t = line.trim();
          if (t.startsWith('/**') || t.startsWith('*') || t.startsWith('//')) {
            const clean = t.replace(/^\/\*\*\s*/, '').replace(/^\*\s*/, '').replace(/^\/\/\s*/, '').replace(/\*\/$/, '').trim();
            if (clean.length > 10 && clean.length < 150 && !clean.startsWith('@') && !clean.startsWith('import')) {
              desc = clean;
              break;
            }
          }
        }
      } catch {}
      entries.push({ name, type: 'file', desc });
    }
  }
  return entries;
}

function formatTree(entries, indent = '') {
  const lines = [];
  for (const entry of entries) {
    if (entry.type === 'dir') {
      lines.push(`${indent}${entry.name}/`);
      if (entry.children?.length) lines.push(...formatTree(entry.children, indent + '  '));
    } else {
      const desc = entry.desc ? ` — ${entry.desc}` : '';
      lines.push(`${indent}${entry.name}${desc}`);
    }
  }
  return lines;
}

async function generate() {
  console.log('Generating Ava self-knowledge pack...');

  let output = '';

  // Section 1: File trees
  output += '# Ava | Supernova — Source Code Index\n\n';
  for (const pkg of PACKAGES) {
    if (!existsSync(pkg.path)) {
      output += `## ${pkg.label}\n(not available locally)\n\n`;
      continue;
    }
    output += `## ${pkg.label}\n`;
    const tree = await scanDir(pkg.path);
    output += formatTree(tree).join('\n') + '\n\n';
  }

  // Section 2: Key file contents
  output += '\n---\n\n# Key Source Files\n\n';
  output += 'These are the core files that define Ava\'s architecture. Interfaces, types, class signatures, and model definitions.\n\n';

  for (const relPath of KEY_FILES) {
    const fullPath = join(MONOREPO_ROOT, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const content = await readFile(fullPath, 'utf-8');
      const processed = extractSignatures(content);
      output += `### ${relPath}\n\`\`\`typescript\n${processed}\n\`\`\`\n\n`;
    } catch {
      output += `### ${relPath}\n(could not read)\n\n`;
    }
  }

  // Write output
  const outPath = join(CORE_ROOT, 'src', 'knowledge', 'self-knowledge.ts');
  const tsContent = `// Auto-generated by scripts/generate-self-knowledge.mjs — do not edit manually
// Regenerated on every build to stay in sync with the codebase.

export const SELF_KNOWLEDGE_CONTENT = ${JSON.stringify(output)};

export const SELF_KNOWLEDGE_PACK = {
  id: 'ava-self-knowledge',
  name: 'Ava Self-Knowledge',
  description: 'Complete index of Ava\\'s own source code with key file contents.',
  category: 'internal' as const,
  content: SELF_KNOWLEDGE_CONTENT,
  alwaysActive: true,
};
`;

  await writeFile(outPath, tsContent, 'utf-8');
  const sizeKB = (output.length / 1024).toFixed(1);
  console.log(`Self-knowledge pack written to ${relative(MONOREPO_ROOT, outPath)} (${sizeKB} KB)`);
}

generate().catch(err => {
  console.error('Failed to generate self-knowledge:', err);
  process.exit(1);
});
