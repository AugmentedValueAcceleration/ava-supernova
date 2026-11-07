import { describe, it, expect } from 'vitest';
import { toolRequestInWords } from '../src/tools/tool-request-words.js';

describe('a permission card in plain words', () => {
  it('says what installing a font will do, naming the weights', () => {
    const words = toolRequestInWords('design_install_font', { family: 'Sora', weights: [100, 200, 300] });
    expect(words).toBe("Install the free Sora font (Thin, ExtraLight and Light) on your computer. It's openly licensed, and only your user account gets it.");
  });

  it('copes with no weights', () => {
    expect(toolRequestInWords('design_install_font', { family: 'Sora' })).toContain('free Sora font on your');
  });

  it('never shows raw data for a tool it has no words for', () => {
    const words = toolRequestInWords('design_save_to_kit', { kit_id: 'x', files: ['a'] });
    expect(words).toBe('Use its "design save to kit" tool');
    expect(words).not.toContain('{');
  });

  it('keeps a long command short', () => {
    expect(toolRequestInWords('bash', { command: 'x'.repeat(300) }).length).toBeLessThan(125);
  });
});
