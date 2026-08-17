/**
 * Dataset Capture — silently records Ava interactions as training data.
 *
 * Writes JSONL to ~/.ava/datasets/raw/ — one line per interaction.
 * Config read from ~/.ava/datasets/config.json (written by the Hub).
 * All local. Nothing leaves the machine.
 */

import { join } from 'node:path';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AVA_HOME } from '../core/constants.js';
import { getTextContent } from '../core/types.js';
import type { Message, ToolCall } from '../core/types.js';
import { logger } from '../core/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

interface CollectionConfig {
  enabled: boolean;
  capture_modes: AvaMode[];
  auto_label_corrections: boolean;
  min_prompt_length: number;
}

interface DatasetExample {
  id: string;
  timestamp: string;
  mode: AvaMode;
  prompt: string;
  response: string;
  tools_used: string[];
  verified_before_answering: boolean;
  user_accepted: boolean;
  correction: string | null;
  quality: 'unlabelled' | 'sycophantic';
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const DATASET_DIR = join(AVA_HOME, 'datasets');
const RAW_DIR = join(DATASET_DIR, 'raw');
const CONFIG_PATH = join(DATASET_DIR, 'config.json');

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CollectionConfig = {
  enabled: false,
  capture_modes: ['work', 'plan', 'chat', 'teach', 'security', 'brainstorm'],
  auto_label_corrections: true,
  min_prompt_length: 10,
};

let configCache: CollectionConfig | null = null;
let configLastRead = 0;
const CONFIG_TTL = 30_000; // re-read config every 30s max

async function loadConfig(): Promise<CollectionConfig> {
  const now = Date.now();
  if (configCache && now - configLastRead < CONFIG_TTL) return configCache;

  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    configCache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    configLastRead = now;
    return configCache!;
  } catch {
    // No config file yet — collection disabled by default
    configCache = DEFAULT_CONFIG;
    configLastRead = now;
    return DEFAULT_CONFIG;
  }
}

// ─── Mode Detection ─────────────────────────────────────────────────────────

const MODE_PREFIXES: [string, AvaMode][] = [
  ['[Chat Mode]', 'chat'],
  ['[Teach Mode]', 'teach'],
  ['[Security Mode]', 'security'],
  ['[Brainstorm Mode]', 'brainstorm'],
  ['[Plan Mode]', 'plan'],
];

function detectMode(messages: Message[]): AvaMode {
  // Check the last user message (before internal planning messages) for mode prefix
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    // Skip internal planning injections
    const text = getTextContent(msg.content);
    if (text.startsWith('[Internal Planning')) continue;

    for (const [prefix, mode] of MODE_PREFIXES) {
      if (text.startsWith(prefix)) return mode;
    }
    // No prefix = work mode (default)
    return 'work';
  }
  return 'work';
}

// ─── Tool Extraction ────────────────────────────────────────────────────────

function extractToolsUsed(messages: Message[]): string[] {
  const tools = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      for (const tc of msg.tool_calls as ToolCall[]) {
        tools.add(tc.function.name);
      }
    }
  }
  return Array.from(tools);
}

// ─── Verification Detection ─────────────────────────────────────────────────

/** Did Ava use a read/search tool before answering? (sign of verification) */
function didVerifyBeforeAnswering(messages: Message[]): boolean {
  const verificationTools = new Set([
    'file_read', 'grep', 'glob', 'list_directory', 'find_symbol',
    'web_search', 'http_request', 'browser', 'project_index',
    'git_status', 'git_diff',
  ]);

  const tools = extractToolsUsed(messages);
  return tools.some(t => verificationTools.has(t));
}

// ─── Correction Detection ───────────────────────────────────────────────────

/** Check if the latest user message looks like a correction of the previous response. */
function detectCorrection(messages: Message[]): string | null {
  // Need at least: user → assistant → user (correction)
  if (messages.length < 3) return null;

  const lastUser = messages[messages.length - 1];
  const prevAssistant = messages[messages.length - 2];
  const prevPrevUser = messages[messages.length - 3];

  if (lastUser?.role !== 'user' || prevAssistant?.role !== 'assistant' || prevPrevUser?.role !== 'user') {
    return null;
  }

  const text = getTextContent(lastUser.content).toLowerCase();
  const correctionSignals = [
    'no ', 'wrong', 'that\'s not', 'thats not', 'incorrect', 'actually',
    'you\'re wrong', 'youre wrong', 'that won\'t work', 'that wont work',
    'not right', 'mistake', 'lied', 'lying', 'false', 'that\'s false',
  ];

  if (correctionSignals.some(sig => text.startsWith(sig) || text.includes(sig))) {
    return getTextContent(lastUser.content);
  }

  return null;
}

// ─── Last Response Extraction ───────────────────────────────────────────────

function extractLastExchange(messages: Message[]): { prompt: string; response: string } | null {
  // Walk backwards to find the last user→assistant pair
  let response: string | null = null;
  let prompt: string | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!response && msg.role === 'assistant' && msg.content) {
      response = getTextContent(msg.content);
    } else if (response && !prompt && msg.role === 'user') {
      const text = getTextContent(msg.content);
      // Skip internal planning injections
      if (!text.startsWith('[Internal Planning')) {
        prompt = text;
        break;
      }
    }
  }

  if (!prompt || !response) return null;
  return { prompt, response };
}

// ─── Main Capture Function ──────────────────────────────────────────────────

/**
 * Capture an Ava interaction as a dataset example.
 * Called after Agent.run() completes with the full message history.
 * Fire-and-forget — never blocks the response.
 */
export async function captureInteraction(messages: Message[]): Promise<void> {
  try {
    const config = await loadConfig();
    if (!config.enabled) return;

    const mode = detectMode(messages);
    if (!config.capture_modes.includes(mode)) return;

    const exchange = extractLastExchange(messages);
    if (!exchange) return;

    // Strip mode prefixes from prompt for cleaner training data
    let cleanPrompt = exchange.prompt;
    for (const [prefix] of MODE_PREFIXES) {
      if (cleanPrompt.startsWith(prefix)) {
        cleanPrompt = cleanPrompt.slice(prefix.length).trim();
        break;
      }
    }

    if (cleanPrompt.length < config.min_prompt_length) return;

    // Detect if this response was a correction of a previous one
    const correction = detectCorrection(messages);
    const quality = (correction && config.auto_label_corrections) ? 'sycophantic' as const : 'unlabelled' as const;

    const example: DatasetExample = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      mode,
      prompt: cleanPrompt,
      response: exchange.response,
      tools_used: extractToolsUsed(messages),
      verified_before_answering: didVerifyBeforeAnswering(messages),
      user_accepted: !correction,
      correction,
      quality,
    };

    // Ensure directory exists
    await mkdir(RAW_DIR, { recursive: true });

    // Append to daily JSONL file.
    //
    // UTC on purpose, and left that way in the 2026-08-17 local-day sweep.
    // This is a PARTITION KEY, not a day anybody reads: files from machines in
    // different timezones have to line up when the dataset is merged, and a
    // local day would put two contributors' identical hour in different
    // buckets. Nothing here is shown to a user, so there is no day to get
    // wrong.
    const date = new Date().toISOString().slice(0, 10);
    const filePath = join(RAW_DIR, `${date}.jsonl`);
    await appendFile(filePath, JSON.stringify(example) + '\n', 'utf-8');

    logger.debug(`[dataset] Captured interaction: mode=${mode} quality=${quality} tools=${example.tools_used.length}`);
  } catch (error) {
    // Never let dataset capture break the main flow
    logger.debug(`[dataset] Capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
