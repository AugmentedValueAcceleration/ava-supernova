/**
 * How Ava's tool calls read in Unreal's panel: a short title and ACP's `kind`
 * (read, edit, delete, move, search, execute, think, fetch, other), which the
 * panel uses for the icon. The same words as the tool lines in VS Code and the
 * IDE (tool-header.ts): an Unreal call is "Unreal · Toolset · Tool".
 */

import { UNREAL_CALL_TOOL, isUserMcpTool } from '@ava/core';

export type AcpToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other';

const READ = new Set(['read', 'list_directory', 'project_index', 'git_status', 'git_diff', 'memory_recall', 'brainstorm_plan', 'self_inspect', 'get_datetime']);
const SEARCH = new Set(['glob', 'grep', 'find_symbol']);
const EDIT = new Set(['write', 'edit', 'memory_save', 'memory_update', 'todo_write', 'document_author', 'document_manage']);
const EXECUTE = new Set(['bash', 'test_run', 'verify_change', 'git_commit', 'benchmark']);
const FETCH = new Set(['web_search', 'http_request', 'browser', 'docs_lookup', 'news']);

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The Unreal tool a call_tool call names, split for the title. */
function unrealParts(args: Record<string, unknown>): { set: string; tool: string } {
  const tool = str(args.tool_name);
  const set = str(args.toolset_name);
  if (set) return { set: set.split('.').pop() ?? set, tool };
  const dot = tool.lastIndexOf('.');
  return dot > 0 ? { set: tool.slice(0, dot).split('.').pop() ?? '', tool: tool.slice(dot + 1) } : { set: '', tool };
}

export function toolKind(name: string, args: Record<string, unknown>): AcpToolKind {
  if (isUserMcpTool(name)) {
    if (!name.endsWith(`_${UNREAL_CALL_TOOL}`)) return 'read';
    // Unreal's own names say what they do (GetActors, SpawnActor…); the label
    // that decides asking is checked elsewhere — this is only the icon.
    const t = unrealParts(args).tool;
    return /^(Get|List|Find|Describe|Search|Query|Read|Is|Has)/.test(t) ? 'read' : 'edit';
  }
  if (READ.has(name)) return 'read';
  if (SEARCH.has(name)) return 'search';
  if (EDIT.has(name)) return 'edit';
  if (EXECUTE.has(name)) return 'execute';
  if (FETCH.has(name)) return 'fetch';
  return 'other';
}

export function toolTitle(name: string, args: Record<string, unknown>): string {
  if (isUserMcpTool(name)) {
    if (name.endsWith(`_${UNREAL_CALL_TOOL}`)) {
      const { set, tool } = unrealParts(args);
      return ['Unreal', set, tool].filter(Boolean).join(' · ');
    }
    const meta = name.replace(/^mcp_[^_]+_/, '');
    if (['list_toolsets', 'describe_toolsets', 'describe_tools'].includes(meta)) return `Unreal · ${meta.replace(/_/g, ' ')}`;
    return meta.replace(/_/g, ' ');
  }
  const target = str(args.file_path) || str(args.path) || str(args.pattern) || str(args.query) || str(args.command) || str(args.url);
  return target ? `${name} ${short(target)}` : name;
}
