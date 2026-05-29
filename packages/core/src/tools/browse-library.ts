import { readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Browse the project's creative asset library.
 *
 * Scans standard asset directories (images/, .ava/creative/, public/, src/assets/)
 * and returns a categorised list of available assets Ava can reference or use.
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

    if (assets.length === 0) {
      return {
        success: true,
        output: filterType === 'all'
          ? 'No creative assets found in the project. Standard locations checked: images/, .ava/creative/, public/, src/assets/, assets/, static/, media/'
          : `No ${filterType} assets found in the project.`,
      };
    }

    // Group by type
    const grouped: Record<string, AssetEntry[]> = {};
    for (const asset of assets) {
      (grouped[asset.type] ??= []).push(asset);
    }

    let output = `Found ${assets.length} asset${assets.length !== 1 ? 's' : ''} in the project:\n\n`;

    for (const [type, items] of Object.entries(grouped).sort()) {
      output += `${type.toUpperCase()} (${items.length})\n`;
      for (const item of items.slice(0, 50)) { // Cap at 50 per type
        const sizeStr = item.size < 1024
          ? `${item.size} B`
          : item.size < 1024 * 1024
          ? `${(item.size / 1024).toFixed(1)} KB`
          : `${(item.size / (1024 * 1024)).toFixed(1)} MB`;
        output += `  ${item.path} (${sizeStr})\n`;
      }
      if (items.length > 50) {
        output += `  ... and ${items.length - 50} more\n`;
      }
      output += '\n';
    }

    return {
      success: true,
      output,
      metadata: {
        totalAssets: assets.length,
        byType: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
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
