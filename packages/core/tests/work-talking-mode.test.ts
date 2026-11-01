// The Talk switch next to Send (1 Nov 2026): Code mode as verbal planning.
// She can read, search and look things up; nothing that changes the project
// runs — not through her own tools, not through a Builder hand-off, and not
// through a persona team.
import { describe, it, expect } from 'vitest';
import { modeCanEditFiles, readOnlyModeToolCeiling, detectModeFromMessages, CHANGING_TOOLS } from '../src/agent/agent.js';
import { modeForTaggedText, tagForMode, ALL_SCAFFOLD_TAGS } from '../src/agent/mode-tags.js';

describe('work:talking', () => {
  it('has its own tag, detected and stripped like every other', () => {
    expect(tagForMode('work:talking')).toBe('[Work Mode: Talk]');
    expect(modeForTaggedText('[Work Mode: Talk] how would we split this file?')).toBe('work:talking');
    expect(modeForTaggedText('[Work Mode] split this file')).toBe('work');
    expect(ALL_SCAFFOLD_TAGS).toContain('[Work Mode: Talk]');
    expect(detectModeFromMessages([{ role: 'user', content: '[Work Mode: Talk] thoughts?' }])).toBe('work:talking');
  });

  it('cannot edit files, so the Builder hand-off is held', () => {
    expect(modeCanEditFiles('work:talking')).toBe(false);
    expect(modeCanEditFiles('work')).toBe(true);
  });

  it('keeps reading, search and the web; drops everything that changes the project', () => {
    const ceiling = readOnlyModeToolCeiling('work:talking');
    expect(ceiling).not.toBeNull();
    for (const t of ['read', 'grep', 'glob', 'list_directory', 'git_diff', 'git_status', 'web_search', 'browser', 'ask_user', 'present_plan']) {
      expect(ceiling!.has(t)).toBe(true);
    }
    for (const t of CHANGING_TOOLS) expect(ceiling!.has(t)).toBe(false);
  });

  it('leaves the social talking room as it was', () => {
    expect(modeCanEditFiles('social:talking')).toBe(false);
    const ceiling = readOnlyModeToolCeiling('social:talking');
    expect(ceiling?.has('write_post')).toBe(false);
  });
});
