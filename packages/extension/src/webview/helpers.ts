// Pure helpers extracted from AvaViewProvider to reduce the monolith surface area.
// None of these functions hold state; they take their inputs explicitly.

import * as vscode from 'vscode';
import { AVA_HOME, ProviderError } from '@ava/core';
import type { Message, PermissionMode } from '@ava/core';

// ── Logging ────────────────────────────────────────────────────────────────

/** Append a timestamped line to the given VS Code output channel. */
export function logTo(channel: vscode.OutputChannel, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  channel.appendLine(`[${timestamp}] ${message}`);
}

// ── Permission mode ────────────────────────────────────────────────────────

/** Read the current permission mode from user settings. Defaults to strict. */
export function readPermissionMode(): PermissionMode {
  const config = vscode.workspace.getConfiguration('ava-supernova');
  return (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
}

// ── Error formatting ───────────────────────────────────────────────────────

/** Given an unknown error, produce a user-facing message + stable error code + suggestion. */
export function deriveErrorInfo(error: unknown): { message: string; code: string; suggestion: string } {
  if (error instanceof ProviderError) {
    const msg = error.humanMessage;
    switch (error.statusCode) {
      case 400: {
        const raw400 = `${error.message} ${typeof error.responseBody === 'string' ? error.responseBody : ''}`.toLowerCase();
        if (raw400.includes('context') || raw400.includes('token') || raw400.includes('length') || raw400.includes('too long') || raw400.includes('maximum')) {
          return { message: msg, code: 'context_truncated', suggestion: 'This conversation has gotten too long for the model. Click the + button to start a fresh chat.' };
        }
        return { message: msg, code: 'bad_request', suggestion: 'Try starting a new chat or switching to a different model.' };
      }
      case 401:
        return { message: msg, code: 'auth', suggestion: 'Go to the Dashboard and check that your API key is correct and hasn\'t expired.' };
      case 402:
        return { message: msg, code: 'credits', suggestion: 'Add credits to your provider account, or sign up for 300 free credits, or add your own API key.' };
      case 403:
        return { message: msg, code: 'forbidden', suggestion: 'Your API key may not have the right permissions. Check your provider dashboard.' };
      case 413:
        return { message: 'Conversation too large to send.', code: 'payload_too_large', suggestion: 'Start a new chat with the + button. Your conversation history has grown too large for the API.' };
      case 404:
        return { message: msg, code: 'model_not_found', suggestion: 'Click the model name in the header to switch to a different model.' };
      case 429:
        return { message: msg, code: 'rate_limit', suggestion: 'Wait about 30 seconds and try again, or switch to a different provider.' };
      case 500: case 502: case 503:
        return { message: msg, code: 'server_error', suggestion: 'This is on the provider\'s side, not yours. Wait a few minutes and try again, or switch providers.' };
      default: {
        const raw = error.message.toLowerCase();
        if (raw.includes('timed out') || raw.includes('timeout')) {
          return { message: msg, code: 'timeout', suggestion: 'The AI took too long to respond. This can happen with complex requests — try again or simplify your message.' };
        }
        if (raw.includes('stream stalled')) {
          return { message: msg, code: 'stream_stall', suggestion: 'The connection to the AI was interrupted. Click Try Again to resend your message.' };
        }
        if (raw.includes('network error') || raw.includes('fetch failed') || raw.includes('econnrefused')) {
          return { message: msg, code: 'network', suggestion: 'Check your internet connection. If you\'re using a local model, make sure the server is running.' };
        }
        return { message: msg, code: 'provider_error', suggestion: 'Something unexpected happened. Try again, or check Output > "Ava Supernova" for technical details.' };
      }
    }
  }

  const rawMsg = error instanceof Error ? error.message : String(error);
  const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;

  if (errorCode === 'iterations_exceeded') {
    return { message: rawMsg, code: 'iterations_exceeded', suggestion: 'Click Try Again to let Ava keep working, or break the task into smaller pieces.' };
  }

  return { message: rawMsg, code: 'unknown', suggestion: 'Something unexpected happened. Try again, or check Output > "Ava Supernova" for technical details.' };
}

// ── Tool confirmation summary ──────────────────────────────────────────────

/** Short one-liner for a tool call — used in confirmation prompts + audit log. */
export function formatToolSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash':
      return `Execute: ${String(args.command ?? '').slice(0, 100)}`;
    case 'file_write':
      return `Write to ${args.file_path}`;
    case 'file_edit':
      return `Edit ${args.file_path}`;
    case 'present_plan':
      return `Plan: ${String(args.title ?? 'Untitled')}`;
    case 'ask_user':
      return String(args.question ?? 'Question');
    case 'list_directory':
      return `List ${args.path}`;
    case 'web_search':
      return `Search: ${String(args.query ?? '').slice(0, 80)}`;
    case 'git_status':
      return `git ${args.command}${args.args ? ' ' + String(args.args).slice(0, 60) : ''}`;
    case 'http_request':
      return `${args.method ?? 'GET'} ${String(args.url ?? '').slice(0, 80)}`;
    default:
      return `${toolName}: ${JSON.stringify(args).slice(0, 100)}`;
  }
}

// ── UI message projection ──────────────────────────────────────────────────

/** Project the agent's Message[] into the minimal shape the chat UI renders. */
export function buildUIMessages(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : (m.content ?? [])
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('') || '[image]',
    }));
}

// ── Learning context loader ────────────────────────────────────────────────

/**
 * Read the user's active learning curriculums from `<globalDir>/learning.json`
 * and format them for system prompt injection. Returns undefined if no active
 * curriculums, or if the file cannot be read for any reason.
 *
 * `globalDir` must be the account-scoped data dir (the learning tool writes to
 * the scoped store); reading the raw AVA_HOME here meant signed-in users lost
 * their active-lesson context in the system prompt.
 */
export function getLearningContext(globalDir: string = AVA_HOME): string | undefined {
  try {
    const fs = require('node:fs');
    const learningPath = require('node:path').join(globalDir, 'learning.json');
    if (!fs.existsSync(learningPath)) return undefined;
    const store = JSON.parse(fs.readFileSync(learningPath, 'utf-8'));
    const active = (store.curriculums || []).filter((c: { status: string }) => c.status === 'active');
    if (active.length === 0) return undefined;
    return active.map((c: { title: string; subject: string; level: string; progress_percent: number; modules: Array<{ title: string; status: string; lessons: Array<{ title: string; status: string; type: string }> }> }) => {
      const currentModule = c.modules.find((m: { status: string }) => m.status === 'in_progress' || m.status === 'available');
      const nextLesson = currentModule?.lessons.find((l: { status: string }) => l.status === 'not_started' || l.status === 'in_progress');
      return `**${c.title}** (${c.subject}, ${c.level}, ${Math.round(c.progress_percent)}% complete)\n` +
        (currentModule ? `  Current module: ${currentModule.title}\n` : '') +
        (nextLesson ? `  Next lesson: ${nextLesson.title} (${nextLesson.type})` : '  All lessons in current module complete — ready to unlock next module');
    }).join('\n\n');
  } catch {
    return undefined;
  }
}
