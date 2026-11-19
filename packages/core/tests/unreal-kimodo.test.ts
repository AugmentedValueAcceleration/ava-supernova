/**
 * The Kimodo guide (plan 2026-11-18-unreal, Phase 4) goes only to projects
 * that switched the plugin on — read from the project's .uproject.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectUsesKimodo } from '../src/mcp/unreal-context.js';

const dirs: string[] = [];
function project(plugins: unknown[] | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'ava-kimodo-'));
  dirs.push(dir);
  if (plugins) writeFileSync(join(dir, 'Game.uproject'), JSON.stringify({ FileVersion: 3, EngineAssociation: '5.9', Plugins: plugins }));
  return dir;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('which projects get the Kimodo guide', () => {
  it('a project with Kimodo on does', () => {
    expect(projectUsesKimodo(project([{ Name: 'ModelingToolsEditorMode', Enabled: true }, { Name: 'Kimodo', Enabled: true }]))).toBe(true);
  });
  it('a project without it, with it switched off, or with no project file does not', () => {
    expect(projectUsesKimodo(project([{ Name: 'AllToolsets', Enabled: true }]))).toBe(false);
    expect(projectUsesKimodo(project([{ Name: 'Kimodo', Enabled: false }]))).toBe(false);
    expect(projectUsesKimodo(project(null))).toBe(false);
    expect(projectUsesKimodo(join(tmpdir(), 'no-such-ava-project'))).toBe(false);
  });
  it('switching it on in the project is seen on the next message', () => {
    const dir = project([{ Name: 'AllToolsets', Enabled: true }]);
    expect(projectUsesKimodo(dir)).toBe(false);
    writeFileSync(join(dir, 'Game.uproject'), JSON.stringify({ Plugins: [{ Name: 'Kimodo', Enabled: true }] }));
    const later = new Date(Date.now() + 5000);
    utimesSync(join(dir, 'Game.uproject'), later, later);
    expect(projectUsesKimodo(dir)).toBe(true);
  });
});
