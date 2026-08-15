import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_DELAY_MS = 5_000;

export class ScreenshotTool implements Tool {
  readonly name = 'screenshot';
  readonly description = 'Capture a screenshot of the current screen for visual analysis';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'screenshot',
    description:
      'Capture a screenshot of the current screen. Returns base64-encoded PNG image data ' +
      'that vision-capable models can analyze. Use this to see what the user sees, ' +
      'verify UI changes, debug visual issues, or check application state. ' +
      'Requires: npm install screenshot-desktop',
    parameters: {
      type: 'object',
      properties: {
        display: {
          type: 'number',
          description: 'Display/screen number to capture (0 = primary). Default: 0.',
        },
        delay_ms: {
          type: 'number',
          description: 'Delay in milliseconds before capturing (useful for menus/tooltips). Default: 0. Max: 5000.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      // Dynamic import — graceful error if not installed
      let screenshotDesktop: (options?: { screen?: number }) => Promise<Buffer>;
      try {
        // @ts-expect-error — screenshot-desktop is an optional peer dependency, only loaded at runtime
        const mod = await import('screenshot-desktop');
        screenshotDesktop = (mod as any).default || mod;
      } catch {
        return {
          success: false,
          output:
            'The screenshot tool requires the screenshot-desktop package which is not available.\n\n' +
            'If running from source, install it with: npm install screenshot-desktop\n' +
            'In the bundled IDE, this tool is not yet supported — it requires a native binary that will be included in a future release.',
        };
      }

      // Handle delay
      const delayMs = Math.min(Math.max((args.delay_ms as number) || 0, 0), MAX_DELAY_MS);
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Capture screenshot
      const display = (args.display as number) ?? 0;
      const buffer: Buffer = await screenshotDesktop({ screen: display });
      const base64 = buffer.toString('base64');
      const sizeKB = Math.round(buffer.length / 1024);

      return {
        success: true,
        output: `Screenshot captured (${sizeKB} KB PNG, display ${display}). The image is available for vision analysis.`,
        metadata: {
          base64_image: base64,
          mime_type: 'image/png',
          size_bytes: buffer.length,
          display,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Catch __dirname / ESM issues from native modules in bundled environments
      if (message.includes('__dirname') || message.includes('not defined') || message.includes('MODULE_NOT_FOUND')) {
        return {
          success: false,
          output:
            'The screenshot tool is not available in this environment.\n\n' +
            'This tool requires the screenshot-desktop native module which cannot run in the bundled IDE.\n' +
            'It works in the VS Code extension and CLI where Node.js modules are fully available.\n' +
            'Support for screenshots in the IDE will be added in a future release.',
        };
      }
      return { success: false, output: `Screenshot capture failed: ${message}` };
    }
  }
}
