/**
 * Harness for the Phase 0 / Session 1 prototype.
 *
 * Wires a real provider, runs the fake task, and prints token measurements.
 * Never registered as a tool. Never exposed in the UI. Always run manually.
 *
 * Default: reads your signed-in platform key from ~/.ava/config.json and runs
 * against the production coordinator (Qwen 3.6 Plus via the platform). No
 * setup required if you've signed in to Ava once on this machine.
 *
 * BYOK override (to measure how different models behave):
 *   $env:AVA_PROTOTYPE_PROVIDER = "deepseek"
 *   $env:AVA_PROTOTYPE_API_KEY  = "sk-..."
 *   $env:AVA_PROTOTYPE_MODEL    = "deepseek-chat"   # optional
 *
 * Usage:
 *   pnpm --filter @ava/proto-desktop-mode run run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { ProviderRegistry, PlatformProvider, AVA_HOME } from '@ava/core';

// ESM replacement for __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));
import type { Provider } from '@ava/core';
import { runStep } from './orchestrator';
import type { PersonaProvider, StepRecord, PersonaName, TokenUsage } from './types';

const MAX_STEPS = 5;
const TASK = 'Open the GitHub notifications page and tell me the three newest ones.';

/** Production coordinator — Spec 8's measurement baseline. */
const DEFAULT_PLATFORM_MODEL = 'qwen3.6-plus';

// ── Provider wiring ────────────────────────────────────────────────────────

function resolveProvider(): { provider: Provider; modelId: string; label: string } {
  const registry = new ProviderRegistry();

  // BYOK override — explicit env vars win.
  const byokName = process.env.AVA_PROTOTYPE_PROVIDER;
  const byokKey = process.env.AVA_PROTOTYPE_API_KEY;
  if (byokName && byokKey) {
    try {
      registry.register(byokName, { apiKey: byokKey });
    } catch (err) {
      console.error(`Provider "${byokName}" failed to register: ${(err as Error).message}`);
      console.error('Supported: deepseek, qwen, kimi, anthropic, mistral, zhipu, minimax');
      process.exit(1);
    }
    const provider = registry.get(byokName);
    if (!provider) {
      console.error(`Provider "${byokName}" registered but cannot be retrieved.`);
      process.exit(1);
    }
    const modelId = process.env.AVA_PROTOTYPE_MODEL ?? provider.listModels()[0]?.id;
    if (!modelId) {
      console.error(`No default model for "${byokName}". Set AVA_PROTOTYPE_MODEL.`);
      process.exit(1);
    }
    return { provider, modelId, label: `${byokName} (BYOK) / ${modelId}` };
  }

  // Default path — read the platform key from your signed-in Ava config.
  const platformKey = readPlatformKey();
  if (!platformKey) {
    console.error('No platform key found at ~/.ava/config.json and no BYOK env vars set.');
    console.error('');
    console.error('Either:');
    console.error('  1. Sign in to Ava (in the extension, IDE, or companion) at least once so your platform key lands in ~/.ava/config.json, then re-run.');
    console.error('  2. Or use BYOK:');
    console.error('       $env:AVA_PROTOTYPE_PROVIDER = "deepseek"');
    console.error('       $env:AVA_PROTOTYPE_API_KEY  = "sk-..."');
    process.exit(1);
  }

  const platformProvider = new PlatformProvider({ apiKey: platformKey });
  registry.registerCustom('platform', platformProvider);

  const modelId = process.env.AVA_PROTOTYPE_MODEL ?? DEFAULT_PLATFORM_MODEL;
  const model = platformProvider.listModels().find((m) => m.id === modelId);
  if (!model) {
    console.error(`Model "${modelId}" not available on the platform provider. Available:`);
    for (const m of platformProvider.listModels()) console.error(`  - ${m.id}`);
    process.exit(1);
  }

  return { provider: platformProvider, modelId, label: `platform / ${modelId}` };
}

function readPlatformKey(): string | undefined {
  const candidates = [
    join(AVA_HOME, 'config.json'),
    join(homedir(), '.ava', 'config.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as { platformKey?: string };
      if (parsed.platformKey && parsed.platformKey.startsWith('sk-ava-')) {
        return parsed.platformKey;
      }
    } catch {
      // next candidate
    }
  }
  return undefined;
}

function wrapAsPersonaProvider(provider: Provider, modelId: string): PersonaProvider {
  return {
    async chat({ systemPrompt, userContent }) {
      const start = Date.now();
      // Core's ChatCompletionRequest has no response_format field — we rely on
      // the persona prompts' "output JSON only" instructions. Non-streaming for
      // simpler usage accounting.
      const result = await provider.createCompletion({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
      });

      const content = result.choices?.[0]?.message?.content ?? '';
      const usage = result.usage;
      return {
        content: typeof content === 'string' ? content : JSON.stringify(content),
        usage: {
          input: usage?.prompt_tokens ?? 0,
          output: usage?.completion_tokens ?? 0,
          total: usage?.total_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
      };
    },
  };
}

// ── Main loop ──────────────────────────────────────────────────────────────

async function main() {
  const { provider, modelId, label } = resolveProvider();
  const personaProvider = wrapAsPersonaProvider(provider, modelId);

  console.log(`\nDesktop automation prototype — Session 1`);
  console.log(`  Provider: ${label}`);
  console.log(`  Task:     ${TASK}\n`);

  const trajectory: StepRecord[] = [];
  let earlyStop: string | null = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    process.stderr.write(`\n── Step ${step} ──\n`);
    try {
      const record = await runStep(personaProvider, TASK, trajectory, step);
      trajectory.push(record);

      process.stderr.write(`  Narrator: ${record.userUpdate.line}\n`);
      process.stderr.write(
        `  Tokens: scout=${record.tokenUsage.scout.total} ` +
          `planner=${record.tokenUsage.planner.total} ` +
          `actor=${record.tokenUsage.actor.total} ` +
          `verifier=${record.tokenUsage.verifier.total} ` +
          `narrator=${record.tokenUsage.narrator.total} ` +
          `(step total ${sumStep(record.tokenUsage)})\n`,
      );

      if (record.proposedAction.kind === 'done') {
        earlyStop = 'Planner reported done.';
        break;
      }
      if (record.proposedAction.kind === 'stuck') {
        earlyStop = 'Planner reported stuck.';
        break;
      }
    } catch (err) {
      console.error(`\nStep ${step} failed: ${(err as Error).message}`);
      break;
    }
  }

  printSummary(trajectory, earlyStop);
  writeResults(trajectory, modelId);
}

// ── Summary + output ──────────────────────────────────────────────────────

function sumStep(usage: Record<PersonaName, TokenUsage>): number {
  return Object.values(usage).reduce((acc, u) => acc + u.total, 0);
}

function printSummary(trajectory: StepRecord[], earlyStop: string | null) {
  if (trajectory.length === 0) {
    console.log('\nNo steps completed.');
    return;
  }

  const totals: Record<PersonaName, { input: number; output: number; total: number; count: number }> = {
    scout: { input: 0, output: 0, total: 0, count: 0 },
    planner: { input: 0, output: 0, total: 0, count: 0 },
    actor: { input: 0, output: 0, total: 0, count: 0 },
    verifier: { input: 0, output: 0, total: 0, count: 0 },
    narrator: { input: 0, output: 0, total: 0, count: 0 },
  };

  for (const record of trajectory) {
    for (const [name, usage] of Object.entries(record.tokenUsage)) {
      const t = totals[name as PersonaName];
      t.input += usage.input;
      t.output += usage.output;
      t.total += usage.total;
      t.count += 1;
    }
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('Per-persona token usage (averaged across steps)');
  console.log('────────────────────────────────────────────────────────');
  console.log('  Persona    In avg    Out avg    Total avg    Calls');
  console.log('  ─────────  ────────  ─────────  ───────────  ─────');
  for (const [name, t] of Object.entries(totals)) {
    const c = t.count || 1;
    const row =
      `  ${name.padEnd(9)} ` +
      `${String(Math.round(t.input / c)).padStart(8)}  ` +
      `${String(Math.round(t.output / c)).padStart(9)}  ` +
      `${String(Math.round(t.total / c)).padStart(11)}  ` +
      `${String(t.count).padStart(5)}`;
    console.log(row);
  }

  const stepsCompleted = trajectory.length;
  const totalTokens = trajectory.reduce((acc, r) => acc + sumStep(r.tokenUsage), 0);
  const avgPerStep = Math.round(totalTokens / stepsCompleted);

  console.log('────────────────────────────────────────────────────────');
  console.log(`Steps completed:  ${stepsCompleted}`);
  console.log(`Total tokens:     ${totalTokens.toLocaleString()}`);
  console.log(`Per step (avg):   ${avgPerStep.toLocaleString()}`);
  console.log(`Spec 8 estimate:  ~11,600 per step (model tokens)`);
  console.log(`Delta vs spec:    ${Math.round(((avgPerStep - 11600) / 11600) * 100)}%`);
  if (earlyStop) console.log(`Early stop:       ${earlyStop}`);
  console.log('════════════════════════════════════════════════════════\n');
}

function writeResults(trajectory: StepRecord[], modelId: string) {
  const outDir = join(__dirname, 'results');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(outDir, `run-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        provider: process.env.AVA_PROTOTYPE_PROVIDER ?? 'platform',
        model: modelId,
        task: TASK,
        startedAt: stamp,
        trajectory,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Results written to ${file}`);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
