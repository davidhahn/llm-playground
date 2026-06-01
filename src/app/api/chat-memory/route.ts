import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

// keep last n turns to control context size
function trimHistory(history: Message[], maxTurns = 10): Message[] {
  // each turn is a user + assistant message pair -> 2 messages
  // So maxTurns = 10 keeps the last 20 messages
  if (history.length <= maxTurns * 2) {
    return history;
  }

  return history.slice(history.length - maxTurns * 2);
}

export async function POST(req: Request) {
  const { message, history = [] }: { message: string; history: Message[] } =
    await req.json();

  // Build the messages array — history + new user message
  const messages: Anthropic.MessageParam[] = [
    ...trimHistory(history),
    { role: 'user', content: message },
  ];

  const encoder = new TextEncoder();
  let assistantMessage = '';

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system:
          'You are a helpful assistant. You have memory of the full conversation so far.',
        messages,
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          assistantMessage += chunk.delta.text;
          send({ type: 'text', content: chunk.delta.text });
        }
      }

      // send the updated history back to the client so it can persist it
      // new history = old history + this user message + assistant response
      const updatedHistory: Message[] = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: assistantMessage },
      ];

      send({ type: 'history', messages: updatedHistory });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
