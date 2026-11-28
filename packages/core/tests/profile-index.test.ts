/**
 * The profile index and profile_lookup (Decisions/plans/2026-11-27-profile-index.md).
 * Reads a FICTIONAL person written in the real file formats (scripts/profile-fixture.mjs).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeProfileFixture } from '../scripts/profile-fixture.mjs';
import { AvaMemory } from '../src/memory-v4/store.js';
import { MemorySession } from '../src/memory-v4/reader.js';
import { buildProfileIndex, profileSectionText, profileIndexBlock, profileOverview } from '../src/profile/index-builder.js';
import { readProfileFiles, readProfileVisibility, writeProfileVisibility } from '../src/profile/sources.js';
import { healthProfileSummary } from '../src/profile/health-text.js';
import { formatLearnerContext } from '../src/learning/learner-context.js';
import { ProfileLookupTool } from '../src/tools/profile-lookup.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { MODE_ALLOWED_TOOLS, toolPassesModeGate } from '../src/agent/agent.js';
import { todayLocal } from '../src/core/dates.js';
import type { ProfileSources } from '../src/profile/types.js';

const today = todayLocal();
let dir: string, home: string, memoryRoot: string, sources: ProfileSources;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-profile-'));
  home = path.join(dir, 'home');
  memoryRoot = path.join(dir, 'memory');
  await writeProfileFixture({ home, memoryRoot, today, AvaMemory });
  const session = await MemorySession.open({ root: memoryRoot, profileHome: home });
  sources = (await session.profileSources())!;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('profile index', () => {
  it('is one short line per area', () => {
    const index = buildProfileIndex(sources, today)!;
    const lines = index.split('\n');
    expect(lines.map((l) => l.split(':')[0])).toEqual(['Studying', 'Training', 'Eating', 'Building']);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(220);
    // ~300 tokens is the budget for the whole index, framing included.
    expect(profileIndexBlock(index).length / 4).toBeLessThan(300);
    expect(index).toContain('Rust Fundamentals');
    expect(index).toContain('2 courses finished');
    expect(index).toContain('tomorrow: Legs');
    expect(index).toContain('injury notes on file');
    expect(index).toContain('tonight: Chickpea and spinach curry with paneer');
    expect(index).toContain('Tidepool (today)');
    expect(index).toContain('Lantern (4 days ago)');
  });

  it('says nothing for someone with nothing recorded', () => {
    const empty = readProfileFiles(path.join(dir, 'nobody'));
    expect(buildProfileIndex({ ...empty, projects: [] }, today)).toBeUndefined();
  });

  it('leaves out a section kept to its room, and the lookup refuses it', () => {
    const roomOnly = { ...sources, visibility: { ...sources.visibility, eating: 'room' as const } };
    expect(buildProfileIndex(roomOnly, today)).not.toContain('Eating:');
    expect(profileSectionText('eating', roomOnly, today)).toMatch(/own room/);
  });
});

describe('profile_lookup detail', () => {
  it('learning is exactly what Teach mode gets', () => {
    expect(profileSectionText('learning', sources, today)).toBe(formatLearnerContext(sources.learning.store!, sources.learning.selfSkills));
  });

  it('training has tomorrow\'s session, the injury and the log, and no food', () => {
    const t = profileSectionText('training', sources, today);
    expect(t).toContain('Back squat: 5×5 at 80 kg');
    expect(t).toContain('left knee niggle');
    expect(t).toContain('Bench press');
    expect(t).not.toContain('paneer');
  });

  it('eating has today\'s meals and the dislikes, and no training', () => {
    const e = profileSectionText('eating', sources, today);
    expect(e).toContain('dinner: Chickpea and spinach curry with paneer (720 kcal, 42 g protein, 30 min)');
    expect(e).toContain('mushrooms');
    expect(e).not.toContain('Back squat');
  });

  it('projects has what was last done in each', () => {
    const p = profileSectionText('projects', sources, today);
    expect(p).toContain('Fixing a borrow error in the sync queue.');
    expect(p).toContain('pricing section still to do');
  });
});

describe('the Health room summary (one copy for extension and IDE)', () => {
  it('includes training and the kitchen, which the IDE used to leave out', () => {
    const s = healthProfileSummary(sources.health, sources.general)!;
    expect(s).toContain('Training days per week: 4');
    expect(s).toContain('Baseline lifts: Back squat 80 kg × 5');
    expect(s).toContain('Cooking level: confident');
    expect(s).toContain('Food dislikes (keep out of plans): mushrooms');
  });
});

describe('wiring', () => {
  it('the session block carries the index only with a profile home', async () => {
    const withProfile = await (await MemorySession.open({ root: memoryRoot, profileHome: home })).sessionBlock();
    const without = await (await MemorySession.open({ root: memoryRoot })).sessionBlock();
    expect(withProfile).toContain('<profile-index>');
    expect(without).not.toContain('<profile-index>');
  });

  it('the hub index leaves projects to the hub\'s own list', async () => {
    const hub = await (await MemorySession.open({ root: memoryRoot, profileHome: home, breadth: 'everything' })).sessionBlock();
    const index = hub.slice(hub.indexOf('<profile-index>'), hub.indexOf('</profile-index>'));
    expect(index).not.toContain('Building:');
    expect(hub).toContain('Their projects');
    // No profile_lookup in the hub yet, so its index must not ask for it.
    expect(hub.slice(hub.indexOf('</profile-index>'))).not.toMatch(/call profile_lookup/);
  });

  it('profile_lookup is registered and reachable in every mode', () => {
    const r = new ToolRegistry();
    r.registerBuiltins();
    expect(r.getSchemas().some((s) => s.function.name === 'profile_lookup')).toBe(true);
    for (const [mode, allowed] of Object.entries(MODE_ALLOWED_TOOLS)) {
      expect(toolPassesModeGate('profile_lookup', allowed, mode), mode).toBe(true);
    }
  });

  it('the tool reads the files and rejects an unknown section', async () => {
    const tool = new ProfileLookupTool({ home, memoryRoot });
    const ok = await tool.execute({ section: 'eating' }, { cwd: dir });
    expect(ok.success).toBe(true);
    expect(ok.output).toContain('Chickpea');
    const bad = await tool.execute({ section: 'finances' }, { cwd: dir });
    expect(bad.success).toBe(false);
  });
});

describe('the Profile page', () => {
  it('shows each area\'s line and detail, even for an area kept to its room', () => {
    const roomOnly = { ...sources, visibility: { ...sources.visibility, eating: 'room' as const } };
    const o = profileOverview(roomOnly, today);
    expect(o.map((s) => s.section)).toEqual(['learning', 'training', 'eating', 'projects']);
    const eating = o.find((s) => s.section === 'eating')!;
    expect(eating.visibility).toBe('room');
    expect(eating.line).toContain('Chickpea');
    // What turning it back on would share, not the refusal Ava gets.
    expect(eating.detail).toContain('Chickpea and spinach curry');
  });

  it('the switch writes one area and keeps the rest of the file', () => {
    const h = path.join(dir, 'switch');
    fs.mkdirSync(h, { recursive: true });
    fs.writeFileSync(path.join(h, 'profile-settings.json'), JSON.stringify({ other: 1 }));
    expect(writeProfileVisibility('training', 'room', h).training).toBe('room');
    expect(readProfileVisibility(h)).toEqual({ learning: 'everywhere', training: 'room', eating: 'everywhere', projects: 'everywhere' });
    expect(JSON.parse(fs.readFileSync(path.join(h, 'profile-settings.json'), 'utf-8')).other).toBe(1);
    expect(writeProfileVisibility('training', 'everywhere', h).training).toBe('everywhere');
  });
});
