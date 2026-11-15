import { describe, it, expect } from 'vitest';
import { documentPathFor } from '../src/tools/authoring/document-places.js';

// 15 Nov 2026: a document Ava creates is saved in the project, in the folder
// the Library views (documents/), unless the person names a folder.
describe('where a new document is saved', () => {
  it('a bare name goes to documents/; a named folder is kept', () => {
    expect(documentPathFor('overview.md')).toBe('documents/overview.md');
    expect(documentPathFor('Docs/overview.pdf')).toBe('Docs/overview.pdf');
    expect(documentPathFor('C:\\Users\\me\\notes.md')).toBe('C:\\Users\\me\\notes.md');
  });
});
