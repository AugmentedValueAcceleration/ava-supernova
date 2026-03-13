import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class GetDateTimeTool implements Tool {
  readonly name = 'get_datetime';
  readonly description = 'Get the current date, time, and timezone from the host system';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'get_datetime',
    description:
      'Get the current date, time, and timezone from the host system. ' +
      'Returns ISO 8601 datetime, human-readable date/time, day of week, Unix timestamp, and timezone. ' +
      'Use this to greet users appropriately, timestamp memories, reference "today" or "now" accurately, ' +
      'and provide time-aware assistance.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const now = new Date();

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const hour = now.getHours();
    let timeOfDay: string;
    if (hour < 6) timeOfDay = 'night';
    else if (hour < 12) timeOfDay = 'morning';
    else if (hour < 17) timeOfDay = 'afternoon';
    else if (hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMinutes = now.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
    const offsetMins = Math.abs(offsetMinutes % 60);
    const offsetSign = offsetMinutes <= 0 ? '+' : '-';
    const utcOffset = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

    const result = {
      iso: now.toISOString(),
      date: `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      timeOfDay,
      dayOfWeek: days[now.getDay()],
      timestamp: Math.floor(now.getTime() / 1000),
      timezone,
      utcOffset,
    };

    return {
      success: true,
      output: JSON.stringify(result, null, 2),
    };
  }
}
