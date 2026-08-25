// A Windows path handed to a Linux host must be refused, not quietly created.
//
// node:path only understands absolutes for the platform it runs on. On POSIX,
// isAbsolute('C:\\Windows\\System32\\config\\SAM') is FALSE — backslash is an
// ordinary filename character there — so resolve() places it INSIDE the
// project as a single file literally named "C:\Windows\System32\config\SAM".
//
// Nothing escapes the working directory on either platform, so this was never
// a traversal. It was one input behaving two different ways depending on the
// host, and inventing an absurd filename rather than reporting that something
// upstream was confused.
//
// The rule is tested DIRECTLY rather than through validatePath, because the
// branch it guards is unreachable on Windows: there, isAbsolute() is already
// true and the ordinary containment check catches these first. A test driving
// validatePath would pass on a Windows machine while proving nothing about the
// platform where it matters — which is exactly how this survived, CI having
// been failing at checkout the entire time the behaviour was asserted.
import { describe, it, expect } from 'vitest';
import { isForeignAbsolute } from '../src/tools/security.js';

describe('foreign absolute paths', () => {
  it('recognises Windows drive letters, both slash styles', () => {
    expect(isForeignAbsolute('C:\\Windows\\System32\\config\\SAM')).toBe(true);
    expect(isForeignAbsolute('C:/Windows/System32/config/SAM')).toBe(true);
    expect(isForeignAbsolute('d:\\data')).toBe(true);
  });

  it('recognises UNC shares', () => {
    expect(isForeignAbsolute('\\\\server\\share\\secrets.txt')).toBe(true);
  });

  it('leaves ordinary project paths alone', () => {
    // The cost of getting this wrong is refusing paths people legitimately
    // use, so the negative cases matter more than the positive ones.
    expect(isForeignAbsolute('src/index.ts')).toBe(false);
    expect(isForeignAbsolute('./src/index.ts')).toBe(false);
    expect(isForeignAbsolute('../sibling/file.ts')).toBe(false);
    expect(isForeignAbsolute('/etc/passwd')).toBe(false);
    // A colon is legal in a POSIX filename. Only a colon FOLLOWED BY a
    // separator is a drive letter, and only when it is the whole prefix.
    expect(isForeignAbsolute('notes:draft.md')).toBe(false);
    expect(isForeignAbsolute('C:')).toBe(false);
    expect(isForeignAbsolute('report:2026/q1.md')).toBe(false);
    expect(isForeignAbsolute('')).toBe(false);
  });
});
