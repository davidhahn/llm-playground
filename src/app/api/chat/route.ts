/*
So what is streaming?
Streaming generates and displays text one by one as it is being processed.
These are usually sent via SSE and is better for interactive / user-facing
tasks (e.g. chatbot, Claude App, etc.). It also has the benefit of being
able to cancel the generation early to save time and token.
*/
import { executeTool, tools } from '@/lib/tools';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: Request) {
  const { message } = await req.json();

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        // serialize each event as JSON line so the frontend can parse it
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      // build up the conversation as we go. start with just the user
      // message.
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: message },
      ];

      // loop so the tool use can be chained. it may call multiple tools
      while (true) {
        const stream = client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          tools,
          messages,
        });

        // collect the full response so we can add it to messages after streaming
        let currentToolName = '';
        let currentToolId = '';
        let currentToolInput = '';
        let currentText = '';
        let stopReason = '';

        const completedToolCalls: Array<{
          id: string;
          name: string;
          input: Record<string, string>;
        }> = [];

        for await (const chunk of stream) {
          if (chunk.type === 'message_delta') {
            stopReason = chunk.delta.stop_reason ?? '';
          }

          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'tool_use') {
              // reset tool state every time a new tool block starts
              currentToolName = chunk.content_block.name;
              currentToolId = chunk.content_block.id;
              currentToolInput = '';
              send({ type: 'tool_start', name: currentToolName });
            }
          }

          if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              currentText += chunk.delta.text;
              send({ type: 'text', content: chunk.delta.text });
            }
            if (chunk.delta.type === 'input_json_delta') {
              currentToolInput += chunk.delta.partial_json;
            }
          }

          if (chunk.type === 'content_block_stop' && currentToolName) {
            // this tool block is complete. parse and store it
            completedToolCalls.push({
              id: currentToolId,
              name: currentToolName,
              input: JSON.parse(currentToolInput),
            });
            // reset so we don't double-process if another block follows
            currentToolName = '';
            currentToolId = '';
            currentToolInput = '';
          }
        }

        if (stopReason === 'tool_use') {
          const assistantToolUseBlocks: Anthropic.Messages.ToolUseBlockParam[] =
            completedToolCalls.map((call) => ({
              type: 'tool_use',
              id: call.id,
              name: call.name,
              input: call.input,
            }));

          const toolResultBlocks: Anthropic.ToolResultBlockParam[] =
            completedToolCalls.map((call) => {
              const result = executeTool(call.name, call.input);
              send({
                type: 'tool_result',
                name: call.name,
                result: JSON.parse(result),
              });
              return {
                type: 'tool_result',
                tool_use_id: call.id,
                content: result,
              };
            });

          messages.push({ role: 'assistant', content: assistantToolUseBlocks });
          messages.push({ role: 'user', content: toolResultBlocks });
        } else {
          // stop_reason is 'end_turn'. model is done, no more tool calls.
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
