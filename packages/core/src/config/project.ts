import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

/** Markers that indicate a directory is a project root (checked in order). */
const PROJECT_MARKERS = ['.ava', '.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.hg'];

/**
 * Walk up from `startDir` looking for a project root.
 * Returns the first directory containing a project marker, or null.
 */
export function detectProjectRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const marker of PROJECT_MARKERS) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** The standard path for project instructions. */
export function getInstructionsPath(projectRoot: string): string {
  return join(projectRoot, '.ava', 'instructions.md');
}

/**
 * Load project instructions from `.ava/instructions.md`.
 * Returns the file contents, or null if the file doesn't exist or is empty.
 */
export async function loadProjectInstructions(projectRoot: string): Promise<string | null> {
  const instructionsPath = getInstructionsPath(projectRoot);
  try {
    const content = await readFile(instructionsPath, 'utf-8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

const INSTRUCTIONS_TEMPLATE = `# Project Instructions for Ava

<!--
  This file is loaded automatically when Ava starts in this project directory.
  Write project-specific context, conventions, and architecture notes here.
  Ava will include this in her system prompt for every conversation.
-->

## Project Overview
<!-- Describe what this project does -->

## Tech Stack
<!-- List languages, frameworks, and key dependencies -->

## Architecture
<!-- Describe the project structure and key patterns -->

## Conventions
<!-- Coding style, naming conventions, testing practices -->

## Important Notes
<!-- Anything Ava should always keep in mind -->
`;

/**
 * Scaffold `.ava/instructions.md` in the given directory.
 * Returns the path to the created file, or null if it already exists.
 */
export async function scaffoldProjectInstructions(projectRoot: string): Promise<string | null> {
  const instructionsPath = getInstructionsPath(projectRoot);
  if (existsSync(instructionsPath)) {
    return null; // already exists
  }
  await mkdir(join(projectRoot, '.ava'), { recursive: true });
  await writeFile(instructionsPath, INSTRUCTIONS_TEMPLATE, 'utf-8');
  return instructionsPath;
}
