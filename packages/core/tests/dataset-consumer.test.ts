import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avaEvents, withTrajectory } from '../src/dataset/emitter.js';
import { installDatasetConsumer, drainPendingWrites } from '../src/dataset/consumer.js';
import {
  saveDatasetConfig,
  invalidateConfigCache,
  configPathFor,
  DEFAULT_CONFIG,
} from '../src/dataset/config.js';
import { eventToDataset } from '../src/dataset/routing.js';

const baseCtx = {
  session_id: 'sess-test',
  surface: 'cli' as const,
  mode: 'work' as const,
  model_id: 'qwen3.7-plus',
};

async function flush(): Promise<void> {
  // First yield so the microtask queue runs (handlers fire and create locks).
  await new Promise((r) => setTimeout(r, 0));
  // Drain whatever the handlers queued onto file locks.
  await drainPendingWrites();
  // One more microtask yield so any follow-up work settles.
  await new Promise((r) => setTimeout(r, 0));
}

let tmpDir: string;
let uninstall: () => void;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'ava-dataset-test-'));
  invalidateConfigCache();
  avaEvents.clearAllHandlers();
  uninstall = installDatasetConsumer({ datasetsDir: tmpDir });
});

afterEach(async () => {
  uninstall();
  await rm(tmpDir, { recursive: true, force: true });
});

async function readJsonlLines(path: string): Promise<unknown[]> {
  const raw = await readFile(path, 'utf-8');
  return raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

describe('dataset consumer', () => {
  it('writes nothing when config.enabled is false (default)', async () => {
    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });
    await flush();
    const entries = await readdir(tmpDir);
    // Nothing written, only the temp dir exists
    expect(entries.filter((e) => e !== 'config.json')).toHaveLength(0);
  });

  it('writes nothing when mode is not in capture_modes', async () => {
    await saveDatasetConfig(configPathFor(tmpDir), {
      ...DEFAULT_CONFIG,
      enabled: true,
      capture_modes: ['plan'], // mode is 'work'
      capture_datasets: ['tool-trajectories'],
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });
    await flush();

    const entries = await readdir(tmpDir);
    expect(entries.filter((e) => e !== 'config.json')).toHaveLength(0);
  });

  it('writes nothing when dataset is not in capture_datasets', async () => {
    await saveDatasetConfig(configPathFor(tmpDir), {
      ...DEFAULT_CONFIG,
      enabled: true,
      capture_modes: ['work'],
      capture_datasets: ['memory-operations'], // tool_choice → tool-trajectories
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });
    await flush();

    const entries = await readdir(tmpDir);
    expect(entries.filter((e) => e !== 'config.json')).toHaveLength(0);
  });

  it('writes events to the correct dataset file when all gates pass', async () => {
    await saveDatasetConfig(configPathFor(tmpDir), {
      ...DEFAULT_CONFIG,
      enabled: true,
      capture_modes: ['work'],
      capture_datasets: ['tool-trajectories', 'memory-operations'],
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: 'auth pattern',
        prev_tools_in_trajectory: [],
      });
      avaEvents.emit('memory_save', {
        scope: 'project',
        layer: 'graph',
        category: 'pattern',
        source: 'auto-extract',
        content_signature: 'auth-flow',
      });
    });
    await flush();

    const today = new Date().toISOString().slice(0, 10);
    const trajLines = await readJsonlLines(
      join(tmpDir, 'tool-trajectories', `${today}.jsonl`),
    );
    const memLines = await readJsonlLines(
      join(tmpDir, 'memory-operations', `${today}.jsonl`),
    );
    expect(trajLines).toHaveLength(1);
    expect(memLines).toHaveLength(1);
    expect((trajLines[0] as any).event_type).toBe('tool_choice');
    expect((memLines[0] as any).event_type).toBe('memory_save');
  });

  it('redacts secrets in event payloads before writing', async () => {
    await saveDatasetConfig(configPathFor(tmpDir), {
      ...DEFAULT_CONFIG,
      enabled: true,
      capture_modes: ['work'],
      capture_datasets: ['tool-trajectories'],
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'http_request',
        args_summary: 'POST /api with key sk-ant-abc1234567890DEF1234567890 and email user@example.com',
        prev_tools_in_trajectory: [],
      });
    });
    await flush();

    const today = new Date().toISOString().slice(0, 10);
    const lines = await readJsonlLines(
      join(tmpDir, 'tool-trajectories', `${today}.jsonl`),
    );
    const summary = (lines[0] as any).payload.args_summary as string;
    expect(summary).not.toContain('sk-ant-abc');
    expect(summary).not.toContain('user@example.com');
    expect(summary).toContain('[REDACTED:anthropic-key]');
    expect(summary).toContain('[REDACTED:email]');
  });

  it('serialises concurrent writes to the same file (no torn lines)', async () => {
    await saveDatasetConfig(configPathFor(tmpDir), {
      ...DEFAULT_CONFIG,
      enabled: true,
      capture_modes: ['work'],
      capture_datasets: ['tool-trajectories'],
    });

    const N = 50;
    withTrajectory(baseCtx, () => {
      for (let i = 0; i < N; i++) {
        avaEvents.emit('tool_choice', {
          tool_name: `tool-${i}`,
          args_summary: `args-${i}`,
          prev_tools_in_trajectory: [],
        });
      }
    });
    await flush();

    const today = new Date().toISOString().slice(0, 10);
    const lines = await readJsonlLines(
      join(tmpDir, 'tool-trajectories', `${today}.jsonl`),
    );
    expect(lines).toHaveLength(N);
    // Every line must be valid JSON with the expected shape
    for (const line of lines) {
      expect((line as any).event_type).toBe('tool_choice');
      expect(typeof (line as any).payload.tool_name).toBe('string');
    }
  });

  it('every event type routes to a known dataset', () => {
    // Compile-time check via exhaustive switch; this asserts at runtime that
    // every emitted event we might see has a target file.
    const types: Parameters<typeof eventToDataset>[0][] = [
      'tool_choice', 'tool_result', 'tool_chain_complete',
      'persona_decision', 'persona_handoff', 'persona_complete',
      'verification_decision', 'correction_received',
      'task_classification', 'routing_decision',
      'tool_error', 'error_guidance_applied', 'recovery_action',
      'memory_save', 'memory_recall', 'memory_update',
      'memory_consolidation', 'memory_forget',
      'continuation_stall_detected', 'continuation_nudge_fired',
      'mode_switch',
      'generation_started', 'generation_complete', 'generation_user_action',
      'knowledge_pack_activated', 'knowledge_pack_used',
    ];
    for (const t of types) {
      expect(typeof eventToDataset(t)).toBe('string');
    }
  });
});
