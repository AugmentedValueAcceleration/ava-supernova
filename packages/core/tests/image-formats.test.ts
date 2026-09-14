import { describe, it, expect } from 'vitest';
import { imageExportOptions, isVectorSource, originalExt, withExt } from '../src/tools/authoring/image-formats.js';

/**
 * Library download formats.
 *
 * ASKED 2026-09-14: "the user should get the option on what format they want
 * to download — i also think svg should be in there too."
 *
 * The rules below are the design decision, so they are pinned: PNG and JPG
 * for any image, the original always kept, and SVG offered when — and only
 * when — the source is vector. A raster image never grows an SVG option,
 * because there is no honest SVG of a photograph.
 */

const fmts = (src: string, mime?: string) => imageExportOptions(src, mime).map((o) => o.format);

describe('imageExportOptions — what is offered', () => {
  it('a Studio WebP: Original (WEBP) · PNG · JPG, and no SVG', () => {
    expect(fmts('https://x/images/image_123.webp')).toEqual(['original', 'png', 'jpg']);
    expect(imageExportOptions('a.webp')[0].label).toBe('Original (WEBP)');
  });

  it('a vector logo: SVG is the original, then PNG and JPG rasterised from it', () => {
    expect(fmts('logos/logo_primary.svg')).toEqual(['svg', 'png', 'jpg']);
    expect(fmts('data:image/svg+xml;base64,PHN2Zz4=')).toEqual(['svg', 'png', 'jpg']);
    expect(fmts('cloud-title-no-ext', 'image/svg+xml')).toEqual(['svg', 'png', 'jpg']);
  });

  it('does not offer the original format twice', () => {
    // A PNG source: Original IS the PNG, so only JPG is a conversion.
    expect(fmts('shot.png')).toEqual(['original', 'jpg']);
    expect(fmts('photo.jpg')).toEqual(['original', 'png']);
    expect(fmts('photo.jpeg')).toEqual(['original', 'png']);
  });

  it('reads the extension off a full URL, a webview URL, and a bare path', () => {
    expect(originalExt('https://cdn/x/y/frame.webp?token=1')).toBe('webp');
    expect(originalExt('https://file+.vscode-resource.vscode-cdn.net/c%3A/Users/a/.ava/creative/images/i.png')).toBe('png');
    expect(originalExt('C:/Users/a/.ava/creative/images/i.webp')).toBe('webp');
    expect(originalExt('data:image/jpeg;base64,/9j/')).toBe('jpg');
  });

  it('a name with no extension falls back rather than guessing wrong', () => {
    expect(originalExt('Epic photoreal cinematic key-art frame')).toBe('webp');
    expect(originalExt('Epic photoreal cinematic key-art frame', '')).toBe('');
  });
});

describe('isVectorSource', () => {
  it('is strict: only .svg or a declared svg type counts', () => {
    expect(isVectorSource('a.svg')).toBe(true);
    expect(isVectorSource('a.SVG')).toBe(true);
    expect(isVectorSource('a.png')).toBe(false);
    expect(isVectorSource('a.webp', 'image/webp')).toBe(false);
    expect(isVectorSource(undefined)).toBe(false);
  });
});

describe('withExt', () => {
  it('keeps the stem and swaps the extension', () => {
    expect(withExt('frame.webp', 'png')).toBe('frame.png');
    expect(withExt('Epic key-art frame, 16:9....webp', 'jpg')).toBe('Epic key-art frame, 16:9....jpg');
    expect(withExt('', 'png')).toBe('download.png');
  });
});
