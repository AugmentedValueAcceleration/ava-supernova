import { readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Browse the user's creative asset library.
 *
 * Scans TWO places, because assets live in two:
 *  1. The project — images/, .ava/creative/, public/, src/assets/ etc. Paths
 *     come back relative to the project, ready to wire into code.
 *  2. The Creative Studio library — everything made in the Studio is saved
 *     account-scoped under <userDataDir>/creative/<kind>/, OUTSIDE any project.
 *     The host passes that directory via sharedState.creativeDir; paths come
 *     back absolute, because that's what they are.
 *
 * (2) used to be missing entirely: the tool only ever scanned project-relative
 * dirs, so every icon, logo, image and voiceover the user made in the Studio
 * was invisible to Ava — she'd report "no assets" and offer to generate a fresh
 * one, burning credits on something they already owned.
 */

const ASSET_EXTENSIONS: Record<string, string> = {
  // Images
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.svg': 'image', '.webp': 'image', '.ico': 'image', '.bmp': 'image',
  // Video
  '.mp4': 'video', '.webm': 'video', '.mov': 'video',
  // Audio
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio',
  // Documents
  '.pdf': 'document', '.docx': 'document',
  '.xlsx': 'spreadsheet',
};

const SCAN_DIRS = [
  'images',
  '.ava/creative',
  'public',
  'src/assets',
  'assets',
  'static',
  'media',
];

interface AssetEntry {
  path: string;
  type: string;
  size: number;
  name: string;
}

export class BrowseLibraryTool implements Tool {
  readonly name = 'browse_library';
  readonly description = 'Browse the project\'s creative asset library to find and reuse existing assets (logos, images, video, audio, documents) by their real path.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'browse_library',
    description:
      'List the project\'s creative assets — images, video, audio, documents the user has created ' +
      '(logos, graphics, clips, voice-overs, music). Use this whenever the project needs an existing ' +
      'asset: to find a user-made logo/image/media and wire it into code or UI by its REAL path. ' +
      'Always browse_library to get the actual path — never invent or guess an asset filename. ' +
      'Generation of new media is user-initiated (it costs credits), so reach for existing assets here ' +
      'rather than assuming something needs to be created. Filter by type to narrow results.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['all', 'image', 'video', 'audio', 'document', 'spreadsheet'],
          description: 'Filter by asset type. Default: all.',
        },
        directory: {
          type: 'string',
          description: 'Scan a specific directory relative to project root instead of the standard locations.',
        },
      },
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filterType = (args.type as string) || 'all';
    const specificDir = args.directory as string | undefined;
    const cwd = context.cwd;

    const assets: AssetEntry[] = [];
    const dirsToScan = specificDir ? [specificDir] : SCAN_DIRS;

    for (const dir of dirsToScan) {
      const fullDir = join(cwd, dir);
      try {
        await this.scanDirectory(fullDir, cwd, assets, filterType);
      } catch {
        // Directory doesn't exist — skip
      }
    }

    // The Creative Studio library — account-scoped, outside the project. Only
    // when the caller didn't ask for one specific project directory.
    const studioAssets: AssetEntry[] = [];
    const creativeDir = typeof context.sharedState?.creativeDir === 'string'
      ? context.sharedState.creativeDir as string
      : undefined;
    if (!specificDir && creativeDir) {
      try {
        // Root the relative-path calc AT the creative dir, so entries read
        // "icons/foo.png" rather than a pile of ../../.. escaping the project.
        await this.scanDirectory(creativeDir, creativeDir, studioAssets, filterType);
      } catch {
        // No library yet — skip
      }
    }

    if (assets.length === 0 && studioAssets.length === 0) {
      return {
        success: true,
        output: filterType === 'all'
          ? 'No creative assets found. Checked the project (images/, .ava/creative/, public/, src/assets/, assets/, static/, media/) and the Creative Studio library.'
          : `No ${filterType} assets found in the project or the Creative Studio library.`,
      };
    }

    const size = (n: number): string =>
      n < 1024 ? `${n} B`
        : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB`
        : `${(n / (1024 * 1024)).toFixed(1)} MB`;

    const section = (entries: AssetEntry[], prefix = ''): string => {
      const grouped: Record<string, AssetEntry[]> = {};
      for (const a of entries) (grouped[a.type] ??= []).push(a);
      let out = '';
      for (const [type, items] of Object.entries(grouped).sort()) {
        out += `${type.toUpperCase()} (${items.length})\n`;
        for (const item of items.slice(0, 50)) { // Cap at 50 per type
          out += `  ${prefix}${item.path} (${size(item.size)})\n`;
        }
        if (items.length > 50) out += `  ... and ${items.length - 50} more\n`;
        out += '\n';
      }
      return out;
    };

    let output = '';
    if (assets.length > 0) {
      output += `In the project (${assets.length} asset${assets.length !== 1 ? 's' : ''}) — paths are project-relative, use them as-is:\n\n`;
      output += section(assets);
    }
    if (studioAssets.length > 0) {
      // Absolute, and said so plainly: these live in the user's Creative Studio
      // library outside the project, so a relative path would be a lie.
      output += `In their Creative Studio library (${studioAssets.length} asset${studioAssets.length !== 1 ? 's' : ''}) — these live outside the project, so the path is absolute. To use one in the project, copy it in rather than referencing it from here:\n\n`;
      output += section(studioAssets, `${creativeDir}/`);
    }

    const byType: Record<string, number> = {};
    for (const a of [...assets, ...studioAssets]) byType[a.type] = (byType[a.type] ?? 0) + 1;

    return {
      success: true,
      output,
      metadata: {
        totalAssets: assets.length + studioAssets.length,
        projectAssets: assets.length,
        studioAssets: studioAssets.length,
        byType,
      },
    };
  }

  private async scanDirectory(
    dir: string,
    cwd: string,
    assets: AssetEntry[],
    filterType: string,
    depth = 0,
  ): Promise<void> {
    if (depth > 5) return; // Prevent deep recursion

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .git, dist, etc.
        if (entry.name.startsWith('.') && entry.name !== '.ava') continue;
        if (['node_modules', 'dist', 'build', '.next', '__pycache__'].includes(entry.name)) continue;
        await this.scanDirectory(fullPath, cwd, assets, filterType, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        const type = ASSET_EXTENSIONS[ext];
        if (!type) continue;
        if (filterType !== 'all' && type !== filterType) continue;

        try {
          const info = await stat(fullPath);
          assets.push({
            path: relative(cwd, fullPath).replace(/\\/g, '/'),
            type,
            size: info.size,
            name: entry.name,
          });
        } catch {
          // Stat failed — skip
        }
      }
    }
  }
}
