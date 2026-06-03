import { executeTool, tools } from '@/lib/agent-tools';
import getPool from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: Request) {
  const { message } = await req.json();
  const pool = getPool();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: message },
      ];

      while (true) {
        const stream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: `You are an internal HR and company knowledge assistant for Acme Corp. You have access to:
1. The company handbook (via search_handbook) — use this for policy questions
2. Employee profiles (via get_employee_info) — use this for employee-specific questions
3. PTO balances (via get_pto_balance) — use this for time off balance questions

Guidelines:
- Always search the handbook before answering policy questions — don't rely on your own knowledge
- If a question involves a specific employee, look them up first
- If a question needs both employee info and a policy, use both tools
- If you can't find relevant information, say so clearly — don't make up policies
- Be concise and direct in your answers`,
          tools,
          messages,
        });

        const completedToolCalls: Array<{
          id: string;
          name: string;
          input: Record<string, string>;
        }> = [];

        let currentToolName = '';
        let currentToolId = '';
        let currentToolInput = '';
        let stopReason = '';

        for await (const chunk of stream) {
          if (chunk.type === 'message_delta') {
            stopReason = chunk.delta.stop_reason ?? '';
          }

          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'tool_use') {
              currentToolName = chunk.content_block.name;
              currentToolId = chunk.content_block.id;
              currentToolInput = '';
              send({ type: 'tool_start', name: currentToolName });
            }
          }

          if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              send({ type: 'text', content: chunk.delta.text });
            }
            if (chunk.delta.type === 'input_json_delta') {
              currentToolInput += chunk.delta.partial_json;
            }
          }

          if (chunk.type === 'content_block_stop' && currentToolName) {
            completedToolCalls.push({
              id: currentToolId,
              name: currentToolName,
              input: JSON.parse(currentToolInput),
            });
            currentToolName = '';
            currentToolId = '';
            currentToolInput = '';
          }
        }

        if (stopReason === 'tool_use') {
          const assistantBlocks: Anthropic.ToolUseBlockParam[] =
            completedToolCalls.map((call) => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.name,
              input: call.input,
            }));

          const toolResults: Anthropic.ToolResultBlockParam[] =
            await Promise.all(
              completedToolCalls.map(async (call) => {
                const result = await executeTool(call.name, call.input, pool);
                const parsed = JSON.parse(result);
                send({ type: 'tool_result', name: call.name, result: parsed });
                return {
                  type: 'tool_result' as const,
                  tool_use_id: call.id,
                  content: result,
                };
              }),
            );

          messages.push({ role: 'assistant', content: assistantBlocks });
          messages.push({ role: 'user', content: toolResults });
        } else {
          break;
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
