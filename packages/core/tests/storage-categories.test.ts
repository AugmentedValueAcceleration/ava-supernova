// The rules behind the storage bar.
//
// These were written out twice — extension host and IDE — with the same keys
// and the same categoryOf, separately maintained. Two surfaces reporting one
// disk differently is a strange failure for a local-first product, so the
// rules moved into core and these hold them down.

import { describe, it, expect } from 'vitest';
import {
  categoryOf, CATEGORY_LABEL, CATEGORY_ORDER,
  isUsageStale, measuredAgo, PROJECTS_USAGE_TTL_MS,
  type ProjectsUsage,
} from '../src/projects/storage-categories.js';

describe('categorising what is in ~/.ava', () => {
  it('gives Ava project data its own row instead of burying it in Other', () => {
    // This is what the change is for: `~/.ava/projects` used to fall through
    // to 'other', so it was invisible in the bar.
    expect(categoryOf('projects')).toBe('projects');
    expect(categoryOf('projects')).not.toBe('other');
  });

  it('does not call it "Projects"', () => {
    // It holds trust state and brainstorm sessions keyed by a path hash — the
    // user's code is elsewhere. A row called "Projects" reading a few KB would
    // say something false about where their work lives.
    expect(CATEGORY_LABEL.projects).toBe('Project data');
  });

  it('still sorts everything it used to', () => {
    expect(categoryOf('models')).toBe('models');
    expect(categoryOf('bin')).toBe('runtime');
    expect(categoryOf('creative')).toBe('creative');
    expect(categoryOf('memory.json')).toBe('memory');
    expect(categoryOf('graph.json')).toBe('memory');
    expect(categoryOf('journal')).toBe('journal');
    expect(categoryOf('datasets')).toBe('datasets');
    expect(categoryOf('memory-backup-2026-06-29')).toBe('backups');
    expect(categoryOf('config.json')).toBe('other');
  });

  it('has a label and a place in the order for every category it can return', () => {
    const produced = ['models', 'runtime', 'creative', 'memory', 'journal',
      'datasets', 'projects', 'backups', 'other'];
    for (const key of produced) {
      expect(CATEGORY_LABEL[key], key).toBeTruthy();
      expect(CATEGORY_ORDER, key).toContain(key);
    }
  });
});

describe('a cached projects measurement', () => {
  const usage = (mins: number): ProjectsUsage => ({
    path: '/home/sam/Ava Projects',
    bytes: 42,
    measuredAt: new Date(Date.now() - mins * 60_000).toISOString(),
  });

  it('is stale when there is nothing, or the stamp is nonsense', () => {
    // A measurement that cannot say when it happened is not a measurement.
    expect(isUsageStale(null)).toBe(true);
    expect(isUsageStale(undefined)).toBe(true);
    expect(isUsageStale({ path: '/p', bytes: 1, measuredAt: 'not a date' })).toBe(true);
  });

  it('is fresh inside the window and stale past it', () => {
    expect(isUsageStale(usage(5))).toBe(false);
    expect(isUsageStale(usage(PROJECTS_USAGE_TTL_MS / 60_000 + 1))).toBe(true);
  });

  it('says how old it is, because a cached number reads as live otherwise', () => {
    expect(measuredAgo(usage(0))).toBe('just now');
    expect(measuredAgo(usage(5))).toBe('5m ago');
    expect(measuredAgo(usage(120))).toBe('2h ago');
    expect(measuredAgo(usage(60 * 24 * 3))).toBe('3d ago');
    expect(measuredAgo(null)).toBeNull();
  });
});
