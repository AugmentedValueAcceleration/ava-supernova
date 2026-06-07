import { describe, it, expect } from 'vitest';
import { filterByCapability, filterForSurface } from '../src/docs/filter.js';
import { surfaceSupports, surfacesFor } from '../src/docs/data/capabilities.js';
import type { DocPage } from '../src/docs/types.js';

function page(id: string, extra: Partial<DocPage> = {}): DocPage {
  return {
    id, title: id, audience: ['both'], surfaces: ['web', 'ext', 'ide'],
    order: 0, section: 'features', body: [], ...extra,
  };
}

describe('capability matrix', () => {
  it('declares the IDE-only capabilities the operator called out', () => {
    expect(surfaceSupports('ide', 'screenshot')).toBe(true);
    expect(surfaceSupports('ext', 'screenshot')).toBe(false);
    expect(surfaceSupports('ide', 'desktop_automation')).toBe(true);
    expect(surfaceSupports('ext', 'desktop_automation')).toBe(false);
  });

  it('shares browser + authoring across ext and ide', () => {
    expect(surfaceSupports('ext', 'browser')).toBe(true);
    expect(surfaceSupports('ide', 'browser')).toBe(true);
    expect(surfaceSupports('companion', 'document_authoring')).toBe(false);
  });

  it('treats web as the superset — every capability "supported"', () => {
    expect(surfaceSupports('web', 'screenshot')).toBe(true);
    expect(surfaceSupports('web', 'desktop_automation')).toBe(true);
  });

  it('exposes the surface set for badges', () => {
    expect(surfacesFor('browser').sort()).toEqual(['ext', 'ide']);
    expect(surfacesFor('screenshot')).toEqual(['ide']);
  });
});

describe('filterByCapability', () => {
  const pages = [
    page('plain'),
    page('shoot', { requires: ['screenshot'] }),
    page('desktop', { requires: ['desktop_automation'] }),
    page('browse', { requires: ['browser'] }),
  ];

  it('hides screenshot + desktop pages on the extension, keeps them on the IDE', () => {
    const ext = filterByCapability(pages, 'ext').map(p => p.id);
    const ide = filterByCapability(pages, 'ide').map(p => p.id);
    expect(ext).toEqual(['plain', 'browse']);
    expect(ide).toEqual(['plain', 'shoot', 'desktop', 'browse']);
  });

  it('hides every capability page on the companion (mobile)', () => {
    expect(filterByCapability(pages, 'companion').map(p => p.id)).toEqual(['plain']);
  });

  it('keeps everything on the web superset', () => {
    expect(filterByCapability(pages, 'web')).toHaveLength(4);
  });
});

describe('filterForSurface (surface + capability gate)', () => {
  it('applies both gates: surface membership AND capability', () => {
    const pages = [
      page('ext-only', { surfaces: ['ext'] }),
      page('ide-shoot', { surfaces: ['ext', 'ide'], requires: ['screenshot'] }),
    ];
    // ext: ext-only passes surface; ide-shoot fails capability (no screenshot).
    expect(filterForSurface(pages, 'ext').map(p => p.id)).toEqual(['ext-only']);
    // ide: ext-only fails surface; ide-shoot passes both.
    expect(filterForSurface(pages, 'ide').map(p => p.id)).toEqual(['ide-shoot']);
  });
});
