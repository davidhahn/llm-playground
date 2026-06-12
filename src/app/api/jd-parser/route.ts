import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type ParsedJD = {
  title: string;
  company: string;
  location: string;
  salary_range: string;
  requirements: string[];
  nice_to_haves: string[];
  tech_stack: string[];
  fit_summary: string;
  seniority_level: 'junior' | 'mid' | 'senior' | 'staff' | 'unknown';
};

export async function POST(req: Request) {
  const { jd_text } = await req.json();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools: [
          {
            name: 'parse_job_description',
            description:
              'Extract structured information from a job description. Always call this tool.',
            input_schema: {
              type: 'object' as const,
              properties: {
                title: {
                  type: 'string',
                  description: 'The job title exactly as written',
                },
                company: {
                  type: 'string',
                  description: 'The company name',
                },
                location: {
                  type: 'string',
                  description: "Location or 'Remote' or 'Hybrid'",
                },
                salary_range: {
                  type: 'string',
                  description:
                    "Salary range if mentioned, otherwise 'Not specified'",
                },
                requirements: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Required qualifications and must-have skills, each as a short phrase',
                },
                nice_to_haves: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Preferred but not required qualifications, each as a short phrase',
                },
                tech_stack: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Specific technologies, frameworks, and tools mentioned',
                },
                fit_summary: {
                  type: 'string',
                  description:
                    'A 2-3 sentence summary of what kind of candidate this role is looking for',
                },
                seniority_level: {
                  type: 'string',
                  enum: ['junior', 'mid', 'senior', 'staff', 'unknown'],
                  description:
                    'Inferred seniority level based on requirements and title',
                },
              },
              required: [
                'title',
                'company',
                'location',
                'salary_range',
                'requirements',
                'nice_to_haves',
                'tech_stack',
                'fit_summary',
                'seniority_level',
              ],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'parse_job_description' },
        messages: [
          {
            role: 'user',
            content: `Parse this job description:\n\n${jd_text}`,
          },
        ],
      });

      let jsonBuffer = '';

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'input_json_delta'
        ) {
          jsonBuffer += chunk.delta.partial_json;

          // Send the raw delta so the frontend can attempt incremental rendering
          send({
            type: 'delta',
            partial_json: chunk.delta.partial_json,
            accumulated: jsonBuffer,
          });
        }

        if (chunk.type === 'content_block_stop') {
          // Full JSON is accumulated — parse and send the complete result
          try {
            const parsed: ParsedJD = JSON.parse(jsonBuffer);
            send({ type: 'complete', data: parsed });
          } catch {
            send({
              type: 'error',
              message: 'Failed to parse structured output',
            });
          }
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
