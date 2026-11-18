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

  it('names the Unreal tool a call_tool call runs, not "call tool"', () => {
    expect(toolRequestInWords('mcp_unreal_call_tool', { toolset_name: 'EditorToolset.ActorToolset', tool_name: 'SpawnActor', arguments: { Class: 'PointLight' } }))
      .toBe('In Unreal: Spawn Actor (ActorToolset), with {"Class":"PointLight"}');
    expect(toolRequestInWords('mcp_unreal_call_tool', { toolset_name: 'EditorToolset.EditorAppToolset', tool_name: 'StartPIE' }))
      .toBe('In Unreal: Start PIE (EditorAppToolset)');
    // Nothing named: the plain fallback.
    expect(toolRequestInWords('mcp_unreal_call_tool', {})).toBe('Use its "mcp unreal call tool" tool');
  });

  it('a server at an address on this computer is not called online', () => {
    expect(toolRequestInWords('connection_add', { name: 'unreal', url: 'http://127.0.0.1:8000/mcp' })).toContain('It is on this computer.');
    expect(toolRequestInWords('connection_add', { name: 'x', url: 'https://example.com/mcp' })).toContain('It is online.');
  });
});
