/*
So what is streaming?
Streaming generates and displays text one by one as it is being processed.
These are usually sent via SSE and is better for interactive / user-facing
tasks (e.g. chatbot, Claude App, etc.). It also has the benefit of being
able to cancel the generation early to save time and token.
*/
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: Request) {
  const { message } = await req.json();

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: message }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(chunk.delta.text);
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
