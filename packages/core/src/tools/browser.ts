import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const NAVIGATION_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_EXTRACT_LENGTH = 20_000;

const ALLOWED_ACTIONS = new Set(['navigate', 'click', 'fill', 'screenshot', 'extract', 'evaluate', 'close']);

/**
 * Block requests to internal-only IP ranges (SSRF protection).
 * localhost and 127.0.0.0/8 are explicitly ALLOWED because Ava runs locally
 * and dev servers always bind to localhost. We only block private network
 * ranges (10.x, 172.16-31.x, 192.168.x) that could reach internal services.
 */
function isPrivateHost(hostname: string): boolean {
  // localhost / 127.x.x.x / [::1] are ALLOWED — dev servers run here
  if (hostname === 'localhost' || hostname === '[::1]') return false;

  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    if (parts[0] === 127) return false;  // loopback — allowed
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
  }

  return false;
}

/**
 * Browser automation tool using Playwright.
 *
 * Maintains a persistent browser instance across calls so actions like
 * navigate → fill → click → screenshot work as a multi-step workflow.
 */
export class BrowserTool implements Tool {
  readonly name = 'browser';
  readonly description = 'Automate browser interactions — navigate, click, fill, screenshot, extract text, run JS';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  // Persistent state across calls
  private browser: any = null;
  private page: any = null;

  readonly schema: FunctionSchema = {
    name: 'browser',
    description:
      'Automate browser interactions using Playwright (headless Chromium). ' +
      'The browser persists across calls so you can navigate, then interact with the page. ' +
      'Actions: navigate (go to URL), click (CSS selector), fill (type into input), ' +
      'screenshot (capture page as PNG), extract (get page text), evaluate (run JS), close (cleanup). ' +
      'Requires Playwright. If it is not installed yet (common on fresh machines), ' +
      'installing it is PRE-AUTHORIZED — do NOT ask the user for permission, just install ' +
      "and retry. Run the project's package manager to add playwright (pnpm add playwright " +
      'or npm install playwright), then `npx playwright install chromium` to download the ' +
      'browser binary, then call browser again.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'click', 'fill', 'screenshot', 'extract', 'evaluate', 'close'],
          description:
            'Action to perform. navigate: go to URL. click: click element. fill: type text. ' +
            'screenshot: capture page. extract: get page text. evaluate: run JS. close: cleanup browser.',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to (required for navigate action).',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the target element (required for click, fill; optional for screenshot, extract).',
        },
        value: {
          type: 'string',
          description: 'Text to type (required for fill action).',
        },
        script: {
          type: 'string',
          description: 'JavaScript to evaluate in the page context (required for evaluate action). Has no Node.js access.',
        },
        full_page: {
          type: 'boolean',
          description: 'Capture full scrollable page instead of viewport only (for screenshot). Default: false (viewport only — smaller, usually what you want). Set true only when you genuinely need content below the fold.',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;

    if (!ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        output: `Invalid action "${action}". Use one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
      };
    }

    // Close action doesn't need browser to be open
    if (action === 'close') {
      return this.closeBrowser();
    }

    // Ensure browser is running for all other actions
    try {
      await this.ensureBrowser();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: message };
    }

    try {
      switch (action) {
        case 'navigate': return await this.doNavigate(args);
        case 'click':    return await this.doClick(args);
        case 'fill':     return await this.doFill(args);
        case 'screenshot': return await this.doScreenshot(args);
        case 'extract':  return await this.doExtract(args);
        case 'evaluate': return await this.doEvaluate(args);
        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Browser action "${action}" failed: ${message}` };
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser && this.page) return;

    let playwright: any;
    try {
      // @ts-ignore — playwright is an optional peer dependency, only loaded at runtime
      playwright = await import('playwright');
    } catch {
      throw new Error(
        'Playwright is not installed. This is the standard browser automation backend ' +
        'and installing it is PRE-AUTHORIZED — you do not need to ask the user for ' +
        'permission. Install it now and retry the browser action:\n' +
        "  1. Add the package via the project's package manager:\n" +
        '       pnpm add playwright    (if pnpm-lock.yaml exists)\n' +
        '       npm install playwright (otherwise)\n' +
        '  2. Download the Chromium browser binary:\n' +
        '       npx playwright install chromium\n' +
        'After both commands succeed, call the browser tool again with the original action.',
      );
    }

    const chromium = playwright.default?.chromium || playwright.chromium;
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  }

  private async doNavigate(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) {
      return { success: false, output: 'URL is required for navigate action.' };
    }

    // Validate URL — http/https only, no private hosts
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, output: `Unsupported protocol: ${parsed.protocol}. Only http:// and https:// are allowed.` };
      }
      if (isPrivateHost(parsed.hostname)) {
        return { success: false, output: `Blocked: navigation to private/internal addresses is not allowed (${parsed.hostname}).` };
      }
    } catch {
      return { success: false, output: `Invalid URL: ${url}` };
    }

    await this.page.goto(url, { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const title = await this.page.title();
    const currentUrl = this.page.url();

    return {
      success: true,
      output: `Navigated to: ${currentUrl}\nTitle: ${title}`,
      metadata: { url: currentUrl, title },
    };
  }

  private async doClick(args: Record<string, unknown>): Promise<ToolResult> {
    const selector = args.selector as string;
    if (!selector) {
      return { success: false, output: 'Selector is required for click action.' };
    }

    await this.page.click(selector);
    // Brief wait for any navigation or JS triggered by click
    await this.page.waitForTimeout(500);

    return {
      success: true,
      output: `Clicked: ${selector}\nCurrent URL: ${this.page.url()}`,
    };
  }

  private async doFill(args: Record<string, unknown>): Promise<ToolResult> {
    const selector = args.selector as string;
    const value = args.value as string;
    if (!selector) {
      return { success: false, output: 'Selector is required for fill action.' };
    }
    if (value === undefined || value === null) {
      return { success: false, output: 'Value is required for fill action.' };
    }

    await this.page.fill(selector, value);

    return {
      success: true,
      output: `Filled "${selector}" with text (${value.length} chars)`,
    };
  }

  private async doScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
    // Default to viewport only (not fullPage). Full-page screenshots of
    // scrollable pages can be 5-10x larger than viewport captures and the
    // visible area is almost always what the model needs. Callers who
    // genuinely need the whole scrollable page can pass full_page: true.
    const fullPage = (args.full_page as boolean) ?? false;
    const selector = args.selector as string | undefined;

    let buffer: Buffer;
    if (selector) {
      const element = await this.page.$(selector);
      if (!element) {
        return { success: false, output: `Element not found: ${selector}` };
      }
      buffer = await element.screenshot({ type: 'png' });
    } else {
      buffer = await this.page.screenshot({ type: 'png', fullPage });
    }

    const base64 = buffer.toString('base64');
    const sizeKB = Math.round(buffer.length / 1024);

    return {
      success: true,
      output: `Screenshot captured (${sizeKB} KB PNG${selector ? `, element: ${selector}` : fullPage ? ', full page' : ', viewport'}). The image is available for vision analysis.`,
      metadata: {
        base64_image: base64,
        mime_type: 'image/png',
        size_bytes: buffer.length,
      },
    };
  }

  private async doExtract(args: Record<string, unknown>): Promise<ToolResult> {
    const selector = args.selector as string | undefined;

    let text: string;
    if (selector) {
      const element = await this.page.$(selector);
      if (!element) {
        return { success: false, output: `Element not found: ${selector}` };
      }
      text = await element.innerText();
    } else {
      text = await this.page.innerText('body');
    }

    if (text.length > MAX_EXTRACT_LENGTH) {
      text = text.slice(0, MAX_EXTRACT_LENGTH) + '\n... (text truncated)';
    }

    const title = await this.page.title();
    const url = this.page.url();

    return {
      success: true,
      output: `Page: ${title} (${url})\n\n${text}`,
      metadata: { url, title, textLength: text.length },
    };
  }

  private async doEvaluate(args: Record<string, unknown>): Promise<ToolResult> {
    const script = args.script as string;
    if (!script) {
      return { success: false, output: 'Script is required for evaluate action.' };
    }

    const result = await this.page.evaluate(script);
    const output = result === undefined ? '(undefined)'
      : result === null ? '(null)'
      : typeof result === 'object' ? JSON.stringify(result, null, 2)
      : String(result);

    return {
      success: true,
      output: `Result: ${output}`,
      metadata: { result },
    };
  }

  /** Close the browser and release resources. */
  closeBrowser(): ToolResult {
    if (!this.browser) {
      return { success: true, output: 'No browser session to close.' };
    }

    try {
      // Fire-and-forget close — don't await to avoid hanging on already-closed browsers
      const b = this.browser;
      this.browser = null;
      this.page = null;
      b.close().catch(() => {});

      return { success: true, output: 'Browser session closed.' };
    } catch {
      this.browser = null;
      this.page = null;
      return { success: true, output: 'Browser session cleaned up.' };
    }
  }
}
