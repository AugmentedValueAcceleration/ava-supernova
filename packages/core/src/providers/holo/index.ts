/**
 * HoloClient — Lightweight client for Holo3 computer use model.
 *
 * Holo3 by H Company: sees screenshots, returns precise desktop actions.
 * OpenAI-compatible API at https://api.hcompany.ai/v1/
 * Models: Holo3-35B-A3B (fast, 3B active) or Holo3-122B-A10B (complex, 10B active)
 *
 * Apache 2.0 license — open weights, open API.
 */

const HOLO_API_BASE = 'https://api.hcompany.ai/v1';
const PLATFORM_HOLO_URL = 'https://ava-supernova.com/api/computer-use';
const DEFAULT_MODEL = 'holo3-122b-a10b';

// ─── Action Types ─────────────────────────────────────────────────────────────

export interface HoloAction {
  type: 'click' | 'type' | 'key' | 'scroll' | 'move' | 'drag' | 'screenshot' | 'done';
  /** Click / move target X coordinate */
  x?: number;
  /** Click / move target Y coordinate */
  y?: number;
  /** Text to type */
  text?: string;
  /** Key to press (Enter, Tab, Escape, etc.) */
  key?: string;
  /** Scroll direction */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Scroll amount (pixels or steps) */
  amount?: number;
  /** Drag end coordinates */
  endX?: number;
  endY?: number;
  /** Summary when task is done */
  summary?: string;
  /** Internal thought from Holo3 (for logging/display) */
  _thought?: string;
  /** Token usage from this Holo3 call */
  _usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface HoloHistoryEntry {
  action: HoloAction;
  screenshot?: string; // base64 thumbnail (compressed) for context
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class HoloClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  /** If true, route through platform API (no direct Holo3 key needed) */
  private usePlatform: boolean;
  private platformKey: string | undefined;
  /** Last API call's token usage */
  private _lastUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

  constructor(apiKey: string, model = DEFAULT_MODEL, baseUrl = HOLO_API_BASE) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
    this.usePlatform = false;
  }

  /**
   * Create a client that routes through the Ava platform (for platform account users).
   * No HAI key needed — charged to their token balance.
   */
  static platform(platformKey: string, model = DEFAULT_MODEL): HoloClient {
    const client = new HoloClient(platformKey, model);
    client.usePlatform = true;
    client.platformKey = platformKey;
    return client;
  }

  /**
   * Given a screenshot and task description, get the next action to perform.
   * Optionally pass action history for multi-step context.
   *
   * @param uiElements - Visible UI elements from UIA for grounding (element names + coordinates)
   * @param visionKnowledge - App-specific visual patterns from knowledge packs
   * @param screenDims - Screenshot dimensions for coordinate reference
   */
  async getNextAction(
    screenshot: string,
    task: string,
    history: HoloHistoryEntry[] = [],
    signal?: AbortSignal,
    uiElements?: Array<{ name: string; control_type: string; cx: number; cy: number }>,
    visionKnowledge?: string,
    screenDims?: { width: number; height: number },
  ): Promise<HoloAction> {
    // Build message sequence: system → history screenshots/actions → current screenshot + task
    const systemParts: string[] = [
      'You are a desktop automation agent. Execute ONE instruction at a time.',
      'You receive a simple instruction like "Press Win+R" or "Type notepad" or "Click the Save button".',
      '',
      'Respond with JSON:',
      '{"thought":"I see the Run dialog","action":{"type":"key","key":"meta+r"}}',
      '{"thought":"Typing text","action":{"type":"type","text":"notepad"}}',
      '{"thought":"Clicking the button","action":{"type":"click","x":500,"y":300}}',
      '{"thought":"Done","action":{"type":"done","summary":"Completed"}}',
      '',
      'Action types: click, type, key, scroll, move, drag, done',
      '',
      'Rules:',
      '- Execute EXACTLY the instruction given — nothing more, nothing less',
      '- "type" sends ALL characters at once. Never one character at a time.',
      '- "Press X" → use {"type":"key","key":"X"}',
      '- "Type X" → use {"type":"type","text":"X"}',
      '- "Click X" → find X on screen, return {"type":"click","x":...,"y":...}',
      '- "Wait" → respond with {"type":"done","summary":"Waited"}',
      '- If the instruction is already done, respond with done',
      '- Coordinates must be within screen bounds',
    ];

    // Inject screen dimensions so model knows the coordinate space
    if (screenDims) {
      systemParts.push(`- Screen size: ${screenDims.width}x${screenDims.height} pixels. All coordinates must be within this range.`);
    }

    // Inject vision knowledge (app-specific visual patterns)
    if (visionKnowledge) {
      systemParts.push('', '## Visual Context', visionKnowledge);
    }

    systemParts.push('', 'RESPOND WITH ONLY JSON.');

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemParts.join('\n') },
    ];

    // Add action history for multi-step context (keep last 6 for better continuity)
    const recentHistory = history.slice(-6);
    for (const entry of recentHistory) {
      // Assistant message: what action was taken
      messages.push({
        role: 'assistant',
        content: JSON.stringify(entry.action),
      });
      // User message: brief note (skip full screenshots in history to keep request small)
      messages.push({
        role: 'user',
        content: 'Action executed. Next screenshot coming.',
      });
    }

    // Build the user message with grounding context
    const userParts: Array<Record<string, unknown>> = [];

    // Text instruction + UIA grounding
    let textContent = `Task: ${task}`;
    if (uiElements && uiElements.length > 0) {
      const elementList = uiElements
        .filter(e => e.name && e.name.trim())
        .slice(0, 20)
        .map(e => `  - ${e.control_type} "${e.name}" at (${e.cx}, ${e.cy})`)
        .join('\n');
      if (elementList) {
        textContent += `\n\n## Visible UI Elements (use these coordinates for precise clicking):\n${elementList}`;
      }
    }
    textContent += '\n\nHere is the current screen. What action should I take next?';
    userParts.push({ type: 'text', text: textContent });

    // Screenshot
    userParts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } });

    messages.push({ role: 'user', content: userParts });

    let raw: string;

    if (this.usePlatform && this.platformKey) {
      // Route through Ava platform — no direct Holo3 key needed
      const res = await fetch(PLATFORM_HOLO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.platformKey}`,
        },
        body: JSON.stringify({
          screenshot,
          task,
          history: history.slice(-5).map(h => ({ action: h.action, screenshot: h.screenshot })),
          model: this.model,
        }),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        throw new Error(`Platform Holo3 error ${res.status}: ${errorText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string | null; reasoning: string | null } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };
      const msg = data.choices?.[0]?.message;
      raw = msg?.content?.trim() || msg?.reasoning?.trim() || '';
      this._lastUsage = data.usage || null;
    } else {
      // Direct Holo3 API (BYOK)
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.0,
          max_tokens: 512,
          chat_template_kwargs: { enable_thinking: false },
          structured_outputs: {
            json: {
              type: 'object',
              properties: {
                thought: { type: 'string', description: 'Your reasoning about what to do next' },
                action: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['click', 'type', 'key', 'scroll', 'move', 'drag', 'done'] },
                    x: { type: 'integer' },
                    y: { type: 'integer' },
                    text: { type: 'string' },
                    key: { type: 'string' },
                    direction: { type: 'string' },
                    amount: { type: 'integer' },
                    endX: { type: 'integer' },
                    endY: { type: 'integer' },
                    summary: { type: 'string' },
                  },
                  required: ['type'],
                },
              },
              required: ['thought', 'action'],
            },
          },
        }),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        throw new Error(`Holo3 API error ${res.status}: ${errorText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string | null; reasoning: string | null } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };
      const msg = data.choices?.[0]?.message;
      raw = msg?.content?.trim() || msg?.reasoning?.trim() || '';
      // Capture usage for tracking
      this._lastUsage = data.usage || null;
    }

    if (!raw) throw new Error('Holo3 returned empty response');

    const action = this.parseAction(raw);
    if (this._lastUsage) {
      action._usage = this._lastUsage;
    }
    return action;
  }

  /**
   * Parse the model's response into a structured action.
   * Handles both clean JSON and wrapped-in-markdown responses.
   */
  private parseAction(raw: string): HoloAction {
    // Strip markdown code fences if present
    let cleaned = raw;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      // Handle {thought, action} wrapper format from structured outputs
      let action: HoloAction;
      if (parsed.thought && parsed.action && typeof parsed.action === 'object') {
        action = parsed.action as HoloAction;
        // Log the thought for debugging / display
        if (parsed.thought) {
          action._thought = parsed.thought as string;
        }
      } else if (parsed.type) {
        // Direct action format (no wrapper)
        action = parsed as unknown as HoloAction;
      } else {
        throw new Error('Response has neither action wrapper nor direct action type');
      }

      // Validate action type
      const validTypes = ['click', 'type', 'key', 'scroll', 'move', 'drag', 'screenshot', 'done'];
      if (!validTypes.includes(action.type)) {
        throw new Error(`Unknown action type: ${action.type}`);
      }

      // Validate required fields per action type
      switch (action.type) {
        case 'click':
        case 'move':
          if (typeof action.x !== 'number' || typeof action.y !== 'number') {
            throw new Error(`${action.type} requires x and y coordinates`);
          }
          break;
        case 'type':
          if (typeof action.text !== 'string') {
            throw new Error('type action requires text field');
          }
          break;
        case 'key':
          if (typeof action.key !== 'string') {
            throw new Error('key action requires key field');
          }
          break;
        case 'scroll':
          if (!action.direction) {
            throw new Error('scroll action requires direction');
          }
          break;
        case 'drag':
          if (typeof action.x !== 'number' || typeof action.y !== 'number' ||
              typeof action.endX !== 'number' || typeof action.endY !== 'number') {
            throw new Error('drag requires x, y, endX, endY');
          }
          break;
      }

      return action;
    } catch (err) {
      // If parsing fails, try to extract action from natural language
      const lower = raw.toLowerCase();
      if (lower.includes('done') || lower.includes('complete') || lower.includes('finished')) {
        return { type: 'done', summary: raw };
      }
      throw new Error(`Could not parse Holo3 response: ${raw.slice(0, 200)}`);
    }
  }
}
