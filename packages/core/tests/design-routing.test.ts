import { describe, it, expect } from 'vitest';
import { classifyTask } from '../src/auto/task-classifier.js';

describe('a Creative Studio turn', () => {
  it('is design work, whatever words the room puts around it', () => {
    const prefixed = '[Design Studio] You are Ava. Make a logo and generate an image. ## Their request make the gold warmer';
    expect(classifyTask(prefixed, 'design', 100).category).toBe('design');
  });

  it('stays design work with a picture attached', () => {
    const parts = [{ type: 'text', text: '[Design Studio] Look at this.' }, { type: 'image_url', image_url: { url: 'data:x' } }];
    expect(classifyTask(parts as never, 'design', 100).category).toBe('design');
  });

  it('the same words outside the Studio are unchanged', () => {
    expect(classifyTask('make a logo', 'code', 100).category).toBe('image_gen');
  });

  it('a named model still wins', () => {
    expect(classifyTask('[Design Studio] @kimi try this', 'design', 100).modelOverride).toBeTruthy();
  });
});
