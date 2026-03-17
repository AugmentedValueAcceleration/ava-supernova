import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class WeatherTool implements Tool {
  readonly name = 'weather';
  readonly description = 'Get current weather and 3-day forecast for a location. Auto-detects location if none specified.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'weather',
    description:
      'Get current weather and 3-day forecast for a location. ' +
      'Auto-detects location by IP if none specified. ' +
      'Use this to be aware of the user\'s environment, make weather-appropriate suggestions, ' +
      'or just chat about the weather.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or location. Auto-detected by IP if omitted.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const location = args.location as string | undefined;

    try {
      const url = location
        ? `https://wttr.in/${encodeURIComponent(location)}?format=j1`
        : `https://wttr.in/?format=j1`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ava-supernova' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          output: `Weather API returned ${response.status}. Try specifying a different location.`,
        };
      }

      const data = await response.json() as Record<string, unknown>;

      // Extract location info
      const nearestArea = (data.nearest_area as Record<string, unknown>[])?.[0];
      const areaName = ((nearestArea?.areaName as Record<string, string>[])?.[0])?.value ?? 'Unknown';
      const country = ((nearestArea?.country as Record<string, string>[])?.[0])?.value ?? '';
      const region = ((nearestArea?.region as Record<string, string>[])?.[0])?.value ?? '';

      const locationStr = [areaName, region, country].filter(Boolean).join(', ');

      // Extract current conditions
      const current = (data.current_condition as Record<string, unknown>[])?.[0];
      const tempC = current?.temp_C ?? '?';
      const tempF = current?.temp_F ?? '?';
      const humidity = current?.humidity ?? '?';
      const windSpeed = current?.windspeedKmph ?? '?';
      const weatherDesc = ((current?.weatherDesc as Record<string, string>[])?.[0])?.value ?? 'Unknown';

      // Build current weather summary
      let output = `## Weather for ${locationStr}\n\n`;
      output += `### Current Conditions\n`;
      output += `- **${weatherDesc}**\n`;
      output += `- Temperature: ${tempC}°C / ${tempF}°F\n`;
      output += `- Humidity: ${humidity}%\n`;
      output += `- Wind: ${windSpeed} km/h\n\n`;

      // Extract 3-day forecast
      const forecast = data.weather as Record<string, unknown>[] | undefined;
      if (forecast && forecast.length > 0) {
        output += `### 3-Day Forecast\n`;
        for (const day of forecast.slice(0, 3)) {
          const date = day.date as string;
          const maxC = day.maxtempC as string;
          const minC = day.mintempC as string;
          const hourly = (day.hourly as Record<string, unknown>[])?.[4]; // midday
          const desc = ((hourly?.weatherDesc as Record<string, string>[])?.[0])?.value ?? 'Unknown';
          output += `- **${date}**: ${desc}, ${minC}°C – ${maxC}°C\n`;
        }
      }

      return {
        success: true,
        output: output.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('abort')) {
        return {
          success: false,
          output: 'Weather request timed out. The service may be slow — try again or specify a location.',
        };
      }
      return {
        success: false,
        output: `Failed to fetch weather: ${message}`,
      };
    }
  }
}
