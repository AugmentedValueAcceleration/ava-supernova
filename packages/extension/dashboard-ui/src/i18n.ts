/**
 * Dashboard i18n — ALL locales loaded statically.
 * No dynamic imports — VS Code webview can't resolve them at runtime.
 * Dispatches 'ava-locale-changed' event to trigger React re-renders.
 */
import { useState, useEffect } from 'react';

// @ts-ignore
import { enStrings } from '../../../core/dist/i18n/locales/en.js';
// @ts-ignore
import { arStrings } from '../../../core/dist/i18n/locales/ar.js';
// @ts-ignore
import { deStrings } from '../../../core/dist/i18n/locales/de.js';
// @ts-ignore
import { esStrings } from '../../../core/dist/i18n/locales/es.js';
// @ts-ignore
import { frStrings } from '../../../core/dist/i18n/locales/fr.js';
// @ts-ignore
import { hiStrings } from '../../../core/dist/i18n/locales/hi.js';
// @ts-ignore
import { idStrings } from '../../../core/dist/i18n/locales/id.js';
// @ts-ignore
import { itStrings } from '../../../core/dist/i18n/locales/it.js';
// @ts-ignore
import { jaStrings } from '../../../core/dist/i18n/locales/ja.js';
// @ts-ignore
import { koStrings } from '../../../core/dist/i18n/locales/ko.js';
// @ts-ignore
import { nlStrings } from '../../../core/dist/i18n/locales/nl.js';
// @ts-ignore
import { plStrings } from '../../../core/dist/i18n/locales/pl.js';
// @ts-ignore
import { ptStrings } from '../../../core/dist/i18n/locales/pt.js';
// @ts-ignore
import { ruStrings } from '../../../core/dist/i18n/locales/ru.js';
// @ts-ignore
import { thStrings } from '../../../core/dist/i18n/locales/th.js';
// @ts-ignore
import { trStrings } from '../../../core/dist/i18n/locales/tr.js';
// @ts-ignore
import { ukStrings } from '../../../core/dist/i18n/locales/uk.js';
// @ts-ignore
import { viStrings } from '../../../core/dist/i18n/locales/vi.js';
// @ts-ignore
import { zhCNStrings } from '../../../core/dist/i18n/locales/zh-CN.js';
// @ts-ignore
import { zhTWStrings } from '../../../core/dist/i18n/locales/zh-TW.js';

let currentLocale = 'en';
let localeVersion = 0;

/** Chat + nav UI strings not in core locale files — English fallbacks */
const chatStrings: Record<string, string> = {
  // Nav sidebar
  'dash.nav.chat': 'Chat with Ava',
  'dash.nav.command_centre': 'Command Centre',
  'dash.nav.memory': 'Memory',
  'dash.nav.tasks': 'Tasks',
  'dash.nav.journal': 'Journal',
  'dash.nav.learning': 'Learning',
  'dash.nav.learning_library': 'Learning Library',
  'dash.nav.learning_library_desc': 'Browse and start learning paths',
  'dash.nav.library': 'Library',
  // Learning Library page
  'dash.learning_library.search': 'Search learning paths...',
  'dash.learning_library.subtitle': 'Curated and community learning paths. Free for everyone.',
  'dash.learning_library.back': 'Back to library',
  'dash.learning_library.curated': 'Curated',
  'dash.learning_library.community': 'Community',
  'dash.learning_library.what_you_learn': 'What you will learn',
  'dash.learning_library.start_learning': 'Start learning',
  'dash.learning_library.starting': 'Starting...',
  'dash.nav.personality': 'Personality',
  'dash.nav.sync': 'Sync',
  'dash.nav.history': 'Usage & History',
  'dash.nav.billing': 'Billing',
  'dash.nav.settings': 'Settings',
  'dash.nav.connections': 'Connections',
  'dash.nav.releases': 'Releases',
  'dash.nav.support': 'Support',
  // Welcome
  'welcome.title': 'Ava Supernova',
  'welcome.subtitle': 'Your open-source agentic coding assistant.',
  'welcome.tagline': '60 tools \u00B7 7 providers \u00B7 2 free models \u00B7 20 languages',
  'welcome.setup_title': 'Get Started \u2014 Add an API Key',
  'welcome.setup_desc': 'Sign up for 3M free Qwen tokens, or add your own API key from any provider.',
  'welcome.setup_cta': 'Open Settings',
  'welcome.ready_with': 'Ready with',
  'welcome.quick_start': 'Quick Start',
  'welcome.capabilities': 'What Ava Can Do',
  'welcome.modes': 'Modes',
  'welcome.footer': 'Open source \u00B7 Your keys, your data \u00B7 Privacy first',
  // Welcome — Capabilities
  'welcome.cap.files': 'Read & Write Files',
  'welcome.cap.files_desc': 'Create, edit, and manage any file in your project',
  'welcome.cap.search': 'Search & Navigate',
  'welcome.cap.search_desc': 'Find files, symbols, and grep across your codebase',
  'welcome.cap.terminal': 'Run Commands',
  'welcome.cap.terminal_desc': 'Execute shell commands and scripts directly',
  'welcome.cap.web': 'Web & APIs',
  'welcome.cap.web_desc': 'Search the web, make HTTP requests, browse pages',
  'welcome.cap.security': 'Security Audit',
  'welcome.cap.security_desc': 'Scan for vulnerabilities and security issues',
  'welcome.cap.memory': 'Persistent Memory',
  'welcome.cap.memory_desc': 'Remembers context across conversations',
  // Welcome — Modes
  'welcome.mode.code_desc': 'Full agent with all tools',
  'welcome.mode.plan_desc': 'Architecture & planning',
  'welcome.mode.chat_desc': 'Discussion only',
  'welcome.mode.security_desc': 'Security scanning',
  'welcome.mode.teach': 'Teach',
  'welcome.mode.teach_desc': 'Ava becomes your personal tutor',
  // Suggestions
  'suggestion.explain': 'Explain this codebase',
  'suggestion.explain_prompt': 'Give me a high-level overview of this project structure and architecture.',
  'suggestion.bug': 'Find a bug',
  'suggestion.bug_prompt': 'Help me find and fix bugs in the current file.',
  'suggestion.test': 'Write tests',
  'suggestion.test_prompt': 'Write comprehensive tests for the main module.',
  'suggestion.refactor': 'Refactor code',
  'suggestion.refactor_prompt': 'Suggest refactoring improvements for the current file.',
  // Error labels
  'error.auth': 'Authentication',
  'error.credits': 'Billing',
  'error.forbidden': 'Access Denied',
  'error.rate_limit': 'Rate Limited',
  'error.model_not_found': 'Model Error',
  'error.bad_request': 'Bad Request',
  'error.server_error': 'Server Error',
  'error.timeout': 'Timeout',
  'error.stream_stall': 'Stream Stalled',
  'error.network': 'Network Error',
  'error.setup': 'Setup Required',
  'error.busy': 'Busy',
  'error.iterations_exceeded': 'Iteration Limit',
  'error.context_truncated': 'Context Truncated',
  'error.provider_error': 'Provider Error',
  // Tool labels
  'tool.read': 'Read {file}',
  'tool.write': 'Write {file}',
  'tool.edit': 'Edit {file}',
  'tool.find_files': 'Find files: {pattern}',
  'tool.search': 'Search: {pattern}',
  'tool.run': 'Run: {command}',
  'tool.list_dir': 'List {path}',
  'tool.web_search': 'Search: {query}',
  'tool.git': 'Git {command}',
  'tool.http': '{method} {url}',
  'tool.allow_prompt': 'Allow {tool}?',
  // History time
  'history.minutes_ago': '{n}m ago',
  'history.hours_ago': '{n}h ago',
  'history.days_ago': '{n}d ago',
  // Memory extras
  'memory.active': 'Active ({count})',
  'memory.archived': 'Archived ({count})',
  'memory.recalled': 'recalled {count}x',
  'memory.last_recalled': 'last: {time}',
  // Model
  'model.vision': 'vision',
  'model.vision_title': 'This model supports image/vision input',
  'model.switched': 'Switched to {model}',
  // Todo
  'todo.done': '{done}/{total} done',
  // Feedback extras
  'feedback.perfect': 'Perfect',
  'feedback.helpful': 'Helpful',
  'feedback.creative': 'Creative',
  'feedback.good_explanation': 'Good explanation',
  'feedback.wrong': 'Wrong',
  'feedback.incomplete': 'Incomplete',
  'feedback.too_verbose': 'Too verbose',
  'feedback.didnt_understand': "Didn't understand me",
  'feedback.off_topic': 'Off topic',
  // Secrets extras
  'secrets.add': 'Add Secret',
  // Input
  'input.placeholder.code': 'What do you want to build?',
  'input.placeholder.plan': 'Describe what you want to plan...',
  'input.placeholder.chat': 'Ask a question or start a discussion...',
  'input.placeholder.disabled': 'Configure a provider to start...',
  'input.placeholder.security': 'Describe what to scan, or just hit Enter for a full audit...',
  'input.placeholder.teach': 'What do you want to learn?',
  'input.placeholder.brainstorm': 'What do you want to explore?',
  'input.mode.code': 'Work',
  'input.mode.plan': 'Plan',
  'input.mode.brainstorm': 'Brainstorm',
  'input.mode.chat': 'Chat',
  'input.mode.teach': 'Teach',
  'input.mode.security': 'Security',
  'input.send': 'Send (Enter)',
  'input.send_aria': 'Send message',
  'input.stop': 'Stop',
  'input.stop_aria': 'Stop Ava',
  'input.attach': 'Attach image',
  'input.attach_image': 'Attach image',
  'input.attach_image_unsupported': 'This model is text-only — switch to a vision-capable model (Qwen 3.5 Omni Plus / Omni Flash, Qwen 3.6 Plus) to attach images.',
  'input.drop_image': 'Drop image here',
  'input.compressing': 'Compressing...',
  'input.compress_usage': 'Context usage \u2014 click to compress',
  'input.compress_click': 'Click to compress context',
  'input.voice_input': 'Voice input',
  'input.voice_stop': 'Stop listening',
  'input.voice_denied': 'Microphone denied \u2014 check browser settings',
  'input.voice_title': 'Voice Input',
  'input.voice_subtitle': 'Speak instead of typing',
  'input.voice_description': 'Ava can listen to your voice and convert it to text. Audio is processed entirely by your browser \u2014 nothing is recorded, stored, or sent to any server.',
  'input.voice_allow': 'Allow',
  'input.voice_deny': 'No Thanks',
  'input.pause_title': 'Tap: pause & check in | Hold: hard stop',
  'input.pause_aria': 'Pause',
  'input.provider_free': 'Free',
  'input.provider_platform': 'Platform',
  'input.provider_api_key': 'API Key',
  'input.provider_switch_free': 'Switch to free/platform tokens',
  'input.provider_use_own_key': 'Use your own API key',
  'input.tokens_remaining': '{remaining} free tokens remaining',
  'input.tokens_unlimited': 'Unlimited tokens',
  'input.mode_switch_hint': 'Click to switch mode (Ctrl+Shift+1\u20146)',
  // Header
  'header.history': 'Chat History',
  'header.tasks': 'Tasks',
  'header.dashboard': 'Dashboard',
  'header.new_chat': 'New Chat',
  // Model
  'model.no_providers': 'No providers configured.',
  'model.open_settings': 'Open Settings',
  // Thinking
  'thinking.0': 'Ava is thinking...',
  'thinking.1': 'Analyzing your code...',
  'thinking.2': 'Considering approaches...',
  'thinking.3': 'Crafting a response...',
  // Errors
  'error.unknown': 'Error',
  'error.continue': 'Continue',
  'error_boundary.title': 'Something went wrong',
  'error_boundary.fallback': 'An unexpected error occurred in the webview.',
  'error_boundary.reset': 'Reset',
  // Tools
  'tool.allow': 'Allow',
  'tool.always_allow': 'Always Allow',
  'tool.always_allow_category_tip': 'Auto-approve this tool category for the rest of the session',
  'tool.deny': 'Deny',
  'tool.arguments': 'Arguments',
  'tool.output': 'Output',
  'tool.error': 'Error',
  'tool.truncated': '... (truncated)',
  'tool.ask_user': 'Question for user',
  // History
  'history.title': 'Chat History',
  'history.new_chat': '+ New Chat',
  'history.close': 'Close',
  'history.search': 'Search conversations...',
  'history.empty': 'No saved conversations yet.',
  'history.no_match': 'No matching conversations.',
  'history.delete_confirm': 'Delete?',
  'history.rename_hint': 'Double-click to rename',
  'history.pin': 'Pin',
  'history.unpin': 'Unpin',
  'history.export_md': 'Export as Markdown',
  'history.pinned': 'Pinned',
  'history.just_now': 'just now',
  // Ask User
  'ask.question': 'Question',
  'ask.fallback': 'Ava has a question',
  'ask.placeholder': 'Type your response...',
  'ask.submit': 'Submit',
  'ask.skip': 'Skip',
  'ask.skipped': 'Skipped',
  // Plan
  'plan.unavailable': 'Plan data unavailable',
  'plan.approved': 'Approved',
  'plan.rejected': 'Rejected',
  'plan.goal': 'Goal',
  'plan.steps': 'Steps',
  'plan.verification': 'Verification',
  'plan.approaches': 'Approaches',
  'plan.approve': 'Approve',
  'plan.reject': 'Reject',
  'plan.pending': 'pending',
  // Todo
  'todo.unavailable': 'Task list unavailable',
  'todo.tasks': 'Tasks',
  // Status
  'status.in': 'in',
  'status.out': 'out',
  // Tasks Panel
  'tasks.today': 'Today',
  'tasks.close': 'Close',
  'tasks.personal': 'Personal',
  'tasks.ava': 'Ava',
  'tasks.filter_today': 'Today',
  'tasks.filter_all': 'All',
  'tasks.no_tasks_today': 'No tasks for today',
  'tasks.no_active_tasks': 'No active tasks',
  'tasks.add_hint': 'Add tasks in the dashboard or ask Ava',
  'tasks.completed': 'Completed',
  'tasks.current': 'Current',
  'tasks.all_complete': 'All tasks complete',
  'tasks.step_of': 'Step {current} of {total}',
  'tasks.no_active_session': 'No active session',
  'tasks.no_completed_yet': 'No completed tasks yet',
  // Memory Panel
  'memory.title': 'Memory v2',
  'memory.close': 'Close',
  'memory.global': 'Global',
  'memory.project': 'Project',
  'memory.add': '+ Add',
  'memory.add_title': 'Add memory',
  'memory.placeholder': 'Enter memory content...',
  'memory.save': 'Save',
  'memory.cancel': 'Cancel',
  'memory.no_archived': 'No archived memories.',
  'memory.no_global': 'No global memories yet. Ava saves memories as you work together.',
  'memory.no_project': 'No project memories yet. Ava saves project-specific patterns here.',
  'memory.restore': 'Restore',
  'memory.archive': 'Archive',
  'memory.delete': 'Delete',
  'memory.confirm': 'Confirm',
  'memory.confirm_delete': 'Confirm delete',
  'memory.delete_permanently': 'Delete permanently',
  'memory.clear_all': 'Clear All',
  'memory.confirm_clear_all': 'Confirm Clear All',
  // Feedback
  'feedback.good': 'Good response',
  'feedback.bad': 'Bad response',
  'feedback.thanks': 'Thanks',
  'feedback.what_good': 'What was good?',
  'feedback.what_wrong': 'What went wrong?',
  'feedback.skip_reason': 'Skip reason',
  'feedback.cancel': 'Cancel',
  // Secrets
  'secrets.title': 'Secret Vault',
  'secrets.label_placeholder': 'Label (e.g. Supabase Key)',
  'secrets.value_placeholder': 'Paste secret value',
  'secrets.save': 'Save',
  'secrets.empty': 'No secrets stored',
  'secrets.reveal': 'Reveal',
  'secrets.hide': 'Hide',
  'secrets.vault_tooltip': 'Secret Vault \u2014 store & inject secrets safely',
  // App
  'app.model_switched': 'Switched to {model}',
  'app.context_compressed': 'Context compressed: ~{original} \u2192 ~{compressed} tokens',
  'app.continue': 'Continue where you left off.',
};

const translations: Record<string, Record<string, string>> = {
  en: { ...enStrings, ...chatStrings }, ar: arStrings, de: deStrings, es: esStrings, fr: frStrings,
  hi: hiStrings, id: idStrings, it: itStrings, ja: jaStrings, ko: koStrings,
  nl: nlStrings, pl: plStrings, pt: ptStrings, ru: ruStrings, th: thStrings,
  tr: trStrings, uk: ukStrings, vi: viStrings, 'zh-CN': zhCNStrings, 'zh-TW': zhTWStrings,
};

/** Set locale. Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-dashboard-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = translations[resolved] ? resolved : 'en';

  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** Translate a key with optional interpolation */
export function t(key: string, params?: Record<string, string | number>): string {
  const str = translations[currentLocale]?.[key]
    ?? translations['en']?.[key]
    ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => {
    const val = params[k];
    return val !== undefined ? String(val) : `{${k}}`;
  });
}

/** Translate with a hardcoded fallback. Returns the fallback when t()
 *  returns the raw key (i.e. the locale doesn't have the key yet).
 *  Use this for new strings being introduced ahead of full locale
 *  coverage so non-English users don't see raw keys. */
export function tt(key: string, fallback: string): string {
  const val = t(key);
  return val === key ? fallback : val;
}

/** React hook — forces re-render when locale changes */
export function useLocale(): string {
  const [, setVersion] = useState(localeVersion);
  useEffect(() => {
    const handler = () => setVersion(++localeVersion);
    window.addEventListener('ava-locale-changed', handler);
    return () => window.removeEventListener('ava-locale-changed', handler);
  }, []);
  return currentLocale;
}

/** Get current locale code */
export function getLocale(): string {
  return currentLocale;
}

/** Format time in 24-hour format (HH:mm) */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Format date as DD/MM/YYYY */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Format date as "31 Mar 2026" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format date as "31 Mar" (no year) */
export function formatDateCompact(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Set locale directly (used by chat init) */
export function setLocale(locale: string): void {
  const resolved = translations[locale] ? locale : 'en';
  currentLocale = resolved;
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** Load additional strings for a locale (used by chat init) */
export function loadStrings(locale: string, strings: Record<string, string>): void {
  if (translations[locale]) {
    translations[locale] = { ...translations[locale], ...strings };
  } else {
    translations[locale] = strings;
  }
}
