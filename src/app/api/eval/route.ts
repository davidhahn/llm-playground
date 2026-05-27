import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type EvalScore = {
  accuracy: { score: number; reasoning: string };
  citation_quality: { score: number; reasoning: string };
  confidence: { score: number; reasoning: string };
  verdict: 'pass' | 'fail';
  overall_score: number;
  flags: string[];
};

async function scoreWithPrompt(
  question: string,
  answer: string,
  sources: string[],
): Promise<EvalScore> {
  const sourcesText = sources
    .map((source, index) => `[${index + 1}] ${source}`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an evaluation system that scores RAG responses. You must respond with ONLY valid JSON matching this exact schema, no other text:
{
  "accuracy": { "score": <0-10>, "reasoning": "<string>" },
  "citation_quality": { "score": <0-10>, "reasoning": "<string>" },
  "confidence": { "score": <0-10>, "reasoning": "<string>" },
  "verdict": "<pass|fail>",
  "overall_score": <0-10>,
  "flags": ["<flag>"]
}

Scoring criteria:
- accuracy: Does the answer correctly reflect the source material? Penalize hallucinations.
- citation_quality: Does the answer reference specific sources? Penalize vague or missing citations.
- confidence: How certain is the answer given the available sources? Penalize overconfident answers with weak sources.
- verdict: pass if overall_score >= 7, fail otherwise
- flags: include any of: hallucination_detected, missing_citation, overconfident, insufficient_sources, off_topic`,
    messages: [
      {
        role: 'user',
        content: `Question: ${question}\n\nAnswer: ${answer}\n\nSources:\n${sourcesText}`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // clean up markdown elements around the response
  const clean = text.replace(/```json\n?|\n?```/g, '').trim();

  return JSON.parse(clean) as EvalScore;
}

async function scoreWithTool(
  question: string,
  answer: string,
  sources: string[],
): Promise<EvalScore> {
  const sourcesText = sources
    .map((source, index) => `[${index + 1}] ${source}`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [
      {
        name: 'submit_eval_score',
        description:
          'Submit the evaluation score for a RAG response. Always call this tool.',
        input_schema: {
          type: 'object' as const,
          properties: {
            accuracy: {
              type: 'object',
              properties: {
                score: { type: 'number', description: 'Score from 0-10' },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            citation_quality: {
              type: 'object',
              properties: {
                score: { type: 'number', description: 'Score from 0-10' },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            confidence: {
              type: 'object',
              properties: {
                score: { type: 'number', description: 'Score from 0-10' },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            verdict: {
              type: 'string',
              enum: ['pass', 'fail'],
            },
            overall_score: {
              type: 'number',
              description: 'Overall score from 0-10',
            },
            flags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Any of: hallucination_detected, missing_citation, overconfident, insufficient_sources, off_topic',
            },
          },
          required: [
            'accuracy',
            'citation_quality',
            'confidence',
            'verdict',
            'overall_score',
            'flags',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_eval_score' },
    messages: [
      {
        role: 'user',
        content: `Evaluate this RAG response.

Question: ${question}

Answer: ${answer}

Sources:
${sourcesText}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not call submit_eval_score');
  }

  return toolUse.input as EvalScore;
}

export async function POST(req: Request) {
  const { question, answer, sources, method = 'tool' } = await req.json();

  try {
    const score =
      method === 'prompt'
        ? await scoreWithPrompt(question, answer, sources)
        : await scoreWithTool(question, answer, sources);

    return Response.json({ score, method });
  } catch (error) {
    console.error('Eval error:', error);
    return Response.json(
      { error: 'Failed to score response' },
      { status: 500 },
    );
  }
}
