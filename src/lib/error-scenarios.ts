import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type ScenarioResult = {
  success: boolean;
  attempts: number;
  result?: string;
  error?: string;
  timeline: Array<{
    attempt: number;
    status: 'trying' | 'failed' | 'retrying' | 'succeeded';
    message: string;
    delayMs?: number;
  }>;
};

// happy path (baseline)
export async function scenarioHappyPath(): Promise<ScenarioResult> {
  const timeline: ScenarioResult['timeline'] = [];
  timeline.push({
    attempt: 1,
    status: 'trying',
    message: 'Calling Anthropic API...',
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [
      { role: 'user', content: "Say 'hello world' and nothing else." },
    ],
  });

  const result =
    response.content[0].type === 'text' ? response.content[0].text : '';
  timeline.push({
    attempt: 1,
    status: 'succeeded',
    message: `Got response: "${result}"`,
  });

  return { success: true, attempts: 1, result, timeline };
}

// malformed JSON output with validation + retry
export async function scenarioBadJson(): Promise<ScenarioResult> {
  const timeline: ScenarioResult['timeline'] = [];
  let attempts = 0;

  // deliberately bad system prompt that causes inconsistent JSON
  const badPrompt = `Return JSON but also add a friendly greeting before it. Format: Hello! {"value": 42}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts = attempt;
    timeline.push({
      attempt,
      status: 'trying',
      message: 'Requesting JSON output...',
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: badPrompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // first try direct parse
      JSON.parse(text);
      timeline.push({
        attempt,
        status: 'succeeded',
        message: 'JSON parsed successfully',
      });
      return { success: true, attempts, result: text, timeline };
    } catch {
      // try extracting JSON from mixed content
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          timeline.push({
            attempt,
            status: 'succeeded',
            message: `Extracted JSON from mixed content: ${jsonMatch[0]}`,
          });
          return { success: true, attempts, result: jsonMatch[0], timeline };
        } catch {
          // fall to retry
        }
      }

      timeline.push({
        attempt,
        status: attempt < 3 ? 'retrying' : 'failed',
        message: `Invalid JSON: "${text.slice(0, 60)}..."`,
        delayMs: attempt < 3 ? 500 : undefined,
      });

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  return {
    success: false,
    attempts,
    error: 'Failed to get valid JSON after 3 attempts',
    timeline,
  };
}

// truncated response (max_tokens too low)
export async function scenarioTruncated(): Promise<ScenarioResult> {
  const timeline: ScenarioResult['timeline'] = [];
  let attempts = 0;

  const maxTokensPerAttempt = [10, 50, 200];

  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts = attempt;
    const maxTokens = maxTokensPerAttempt[attempt - 1];
    timeline.push({
      attempt,
      status: 'trying',
      message: `Trying with max_tokens=${maxTokens}...`,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: 'Write a 3 sentence description of what RAG is.',
        },
      ],
    });

    if (response.stop_reason === 'max_tokens') {
      timeline.push({
        attempt,
        status: 'retrying',
        message: `Response truncated at ${maxTokens} tokens. Retrying with more tokens...`,
        delayMs: 300,
      });
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    const result =
      response.content[0].type === 'text' ? response.content[0].text : '';
    timeline.push({
      attempt,
      status: 'succeeded',
      message: `Complete response received with max_tokens=${maxTokens}`,
    });
    return { success: true, attempts, result, timeline };
  }

  return {
    success: false,
    attempts,
    error: 'Response kept getting truncated',
    timeline,
  };
}

// tool failure with fallback
export async function scenarioToolFailure(): Promise<ScenarioResult> {
  const timeline: ScenarioResult['timeline'] = [];
  timeline.push({
    attempt: 1,
    status: 'trying',
    message: 'Calling agent with flaky tool...',
  });

  // Simulate a tool that fails 2 out of 3 calls
  let toolCallCount = 0;
  function flakyGetData(): string {
    toolCallCount++;
    if (toolCallCount < 3) {
      throw new Error(`Tool call ${toolCallCount} failed: connection timeout`);
    }
    return JSON.stringify({ data: 'Successfully retrieved after retry' });
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        'Use the get_data tool to fetch some data and tell me what you got.',
    },
  ];

  let attempts = 0;

  while (true) {
    attempts++;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      tools: [
        {
          name: 'get_data',
          description: 'Fetch data from an external source.',
          input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        },
      ],
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(
        (block) => block.type === 'tool_use',
      );
      if (!toolUse || toolUse.type !== 'tool_use') {
        break;
      }

      let toolResult: string;
      try {
        toolResult = flakyGetData();
        timeline.push({
          attempt: toolCallCount,
          status: toolCallCount >= 3 ? 'succeeded' : 'retrying',
          message: `Tool call ${toolCallCount}: succeeded`,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        timeline.push({
          attempt: toolCallCount,
          status: 'retrying',
          message: `Tool call ${toolCallCount}: ${errMsg}`,
          delayMs: 500,
        });
        toolResult = JSON.stringify({ error: errMsg, retry: true });
        await new Promise((r) => setTimeout(r, 500));
      }

      messages.push({
        role: 'assistant',
        content: [
          { type: 'tool_use', id: toolUse.id, name: toolUse.name, input: {} },
        ],
      });
      messages.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: toolUse.id, content: toolResult },
        ],
      });
    } else {
      const result = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      timeline.push({
        attempt: attempts,
        status: 'succeeded',
        message: 'Agent recovered and responded',
      });
      return { success: true, attempts: toolCallCount, result, timeline };
    }

    if (attempts > 5) {
      break;
    }
  }

  return {
    success: false,
    attempts,
    error: 'Agent could not recover from tool failures',
    timeline,
  };
}

// permanent error (bad API key simulation)
export async function scenarioPermanentError(): Promise<ScenarioResult> {
  const timeline: ScenarioResult['timeline'] = [];
  timeline.push({
    attempt: 1,
    status: 'trying',
    message: 'Calling API with invalid key...',
  });

  const badClient = new Anthropic({ apiKey: 'sk-invalid-key' });

  try {
    await badClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    return { success: true, attempts: 1, timeline };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isPermanent =
      message.includes('401') ||
      message.includes('403') ||
      message.includes('invalid') ||
      message.includes('authentication');

    timeline.push({
      attempt: 1,
      status: 'failed',
      message: isPermanent
        ? `Permanent error — not retrying: ${message.slice(0, 80)}`
        : `Unknown error: ${message.slice(0, 80)}`,
    });

    return {
      success: false,
      attempts: 1,
      error: isPermanent
        ? 'Authentication error — retrying would not help'
        : message,
      timeline,
    };
  }
}
