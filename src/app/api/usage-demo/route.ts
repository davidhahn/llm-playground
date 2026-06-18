import { trackCreate, trackStream } from '@/lib/track-usage';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: Request) {
  const { query_type } = await req.json();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        if (query_type === 'short') {
          // short streaming response
          const { stream } = await trackStream(
            'usage-demo/short',
            () =>
              client.messages.stream({
                model: 'claude-sonnet-4-6',
                max_tokens: 100,
                messages: [
                  { role: 'user', content: 'In one sentence, what is RAG?' },
                ],
              }),
            { metadata: { query_type: 'short' } },
          );

          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              send({ type: 'text', content: chunk.delta.text });
            }
          }
        } else if (query_type === 'long') {
          // long streaming response
          const { stream } = await trackStream(
            'usage-demo/long',
            () =>
              client.messages.stream({
                model: 'claude-sonnet-4-6',
                max_tokens: 1024,
                messages: [
                  {
                    role: 'user',
                    content:
                      'Explain how RAG, tool use, streaming, structured output, conversation memory, and evals all fit together in a production AI system. Be thorough.',
                  },
                ],
              }),
            { metadata: { query_type: 'long' } },
          );

          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              send({ type: 'text', content: chunk.delta.text });
            }
          }
        } else if (query_type === 'structured') {
          // non-streaming structured output
          const response = await trackCreate(
            'usage-demo/structured',
            async () => {
              const msg = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 256,
                tools: [
                  {
                    name: 'extract',
                    description: 'Extract key info. Always call this.',
                    input_schema: {
                      type: 'object' as const,
                      properties: {
                        topic: { type: 'string' },
                        complexity: {
                          type: 'string',
                          enum: ['low', 'medium', 'high'],
                        },
                        keywords: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['topic', 'complexity', 'keywords'],
                    },
                  },
                ],
                tool_choice: { type: 'tool', name: 'extract' },
                messages: [
                  {
                    role: 'user',
                    content:
                      'Analyze: Building production RAG systems requires careful attention to retrieval quality, latency, and cost.',
                  },
                ],
              });
              return {
                model: msg.model,
                usage: msg.usage,
                stop_reason: msg.stop_reason ?? undefined,
                content: msg.content,
              };
            },
            { metadata: { query_type: 'structured' } },
          );

          const toolUse = response.content.find(
            (block) => block.type === 'tool_use',
          );
          if (toolUse?.type === 'tool_use') {
            send({
              type: 'text',
              content: JSON.stringify(toolUse.input, null, 2),
            });
          }
        }

        // fetch and send the latest 10 logs for display
        const { default: getPool } = await import('@/lib/db');
        const pool = getPool();
        const result = await pool.query(
          `SELECT label, model, input_tokens, output_tokens, total_tokens,
                  cost_usd, latency_ms, stop_reason, created_at
           FROM usage_logs
           ORDER BY created_at DESC
           LIMIT 10`,
        );
        send({ type: 'logs', data: result.rows });
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
