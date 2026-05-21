import Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a given city.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: {
          type: 'string',
          description: 'The city to get weather for, e.g. Chicago',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_time',
    description: 'Get the current time for a given timezone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone string, e.g. America/Chicago',
        },
      },
      required: ['timezone'],
    },
  },
];

// Mock implementations. Swap these out for real APIs later
export function executeTool(
  name: string,
  input: Record<string, string>,
): string {
  if (name === 'get_weather') {
    return JSON.stringify({
      city: input.city,
      temperature: '72F',
      condition: 'Partly Cloudy',
    });
  }

  if (name === 'get_time') {
    const time = new Date().toLocaleTimeString('en-US', {
      timeZone: input.timezone,
    });
    return JSON.stringify({
      timezone: input.timezone,
      time,
    });
  }

  return JSON.stringify({ error: 'Unknown tool' });
}
