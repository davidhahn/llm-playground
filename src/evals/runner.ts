import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { executeTool, tools } from '../lib/agent-tools';
import getPool from '../lib/db';
import { agentCases, ragCases, type EvalCase } from './cases';

dotenv.config({ path: '.env.local' });

const anthropic = new Anthropic();
const openai = new OpenAI();

// ─── Types ────────────────────────────────────────────────────────────────────

type EvalScore = {
  accuracy: { score: number; reasoning: string };
  citation_quality: { score: number; reasoning: string };
  confidence: { score: number; reasoning: string };
  verdict: 'pass' | 'fail';
  overall_score: number;
  flags: string[];
};

type EvalResult = {
  case_id: string;
  question: string;
  answer: string;
  sources: string[];
  tool_called?: string;
  score: EvalScore;
  latency_ms: number;
};

// RAG System

async function runRagQuery(
  question: string,
): Promise<{ answer: string; sources: string[] }> {
  const pool = getPool();

  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  });
  const vectorString = `[${embeddingRes.data[0].embedding.join(',')}]`;

  const result = await pool.query(
    `SELECT content, metadata, similarity
     FROM (
       SELECT content, metadata, 1 - (embedding <=> $1::vector) AS similarity
       FROM documents
     ) subq
     WHERE similarity > 0.3
     ORDER BY similarity DESC
     LIMIT 3`,
    [vectorString],
  );

  const chunks = result.rows;
  const sources = chunks.map((chunk: { content: string }) => chunk.content);

  if (chunks.length === 0) {
    return {
      answer: "I couldn't find relevant information in the knowledge base.",
      sources: [],
    };
  }

  const context = chunks
    .map(
      (
        chunk: { content: string; metadata: { source: string } },
        index: number,
      ) =>
        `[${index + 1}] (source: ${chunk.metadata.source})\n${chunk.content}`,
    )
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `Answer using only the context below. If the answer isn't in the context, say so.\n\nContext:\n${context}`,
    messages: [{ role: 'user', content: question }],
  });

  const answer =
    response.content[0].type === 'text' ? response.content[0].text : '';
  return { answer, sources };
}

// Agent System

async function runAgentQuery(
  question: string,
): Promise<{ answer: string; sources: string[]; tool_called?: string }> {
  const pool = getPool();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ];
  let tool_called: string | undefined;
  const sources: string[] = [];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You are an internal HR assistant for Acme Corp. Always search the handbook for policy questions. Look up employees when asked about specific people.`,
      tools,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use',
      );

      const assistantBlocks: Anthropic.ToolUseBlockParam[] = toolUseBlocks.map(
        (block) => {
          if (block.type !== 'tool_use') {
            throw new Error('Expected tool_use block');
          }

          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, string>,
          };
        },
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== 'tool_use') {
            throw new Error('Expected tool_use block');
          }

          tool_called = block.name;
          const result = await executeTool(
            block.name,
            block.input as Record<string, string>,
            pool,
          );
          const parsed = JSON.parse(result);
          // collect sources from handbook searches
          if (block.name === 'search_handbook' && parsed.results) {
            sources.push(
              ...parsed.results.map((r: { content: string }) => r.content),
            );
          }
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          };
        }),
      );

      messages.push({ role: 'assistant', content: assistantBlocks });
      messages.push({ role: 'user', content: toolResults });
    } else {
      const answer = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      return { answer, sources, tool_called };
    }
  }
}

// Scorer

async function scoreResponse(
  question: string,
  answer: string,
  sources: string[],
  expectedTopics: string[],
): Promise<EvalScore> {
  const sourcesText =
    sources.length > 0
      ? sources.map((source, index) => `[${index + 1}] ${source}`).join('\n')
      : 'No sources retrieved.';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [
      {
        name: 'submit_score',
        description: 'Submit the evaluation score. Always call this tool.',
        input_schema: {
          type: 'object' as const,
          properties: {
            accuracy: {
              type: 'object',
              properties: {
                score: {
                  type: 'number',
                  description:
                    '0-10: does the answer correctly reflect the sources?',
                },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            citation_quality: {
              type: 'object',
              properties: {
                score: {
                  type: 'number',
                  description: '0-10: does the answer cite sources explicitly?',
                },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            confidence: {
              type: 'object',
              properties: {
                score: {
                  type: 'number',
                  description:
                    '0-10: is the confidence level appropriate given the sources?',
                },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            verdict: { type: 'string', enum: ['pass', 'fail'] },
            overall_score: { type: 'number', description: '0-10 overall' },
            flags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Any of: hallucination_detected, missing_citation, overconfident, insufficient_sources, off_topic, correct_refusal',
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
    tool_choice: { type: 'tool', name: 'submit_score' },
    messages: [
      {
        role: 'user',
        content: `Evaluate this RAG response.

Question: ${question}
Expected topics to cover: ${
          expectedTopics.length > 0
            ? expectedTopics.join(', ')
            : "N/A — this is an out-of-domain question, correct behavior is to say the answer isn't available"
        }

Answer: ${answer}

Sources:
${sourcesText}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Scorer did not call submit_score');
  }

  return toolUse.input as EvalScore;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runEvals(
  label: string,
  cases: EvalCase[],
  queryFn: (
    query: string,
  ) => Promise<{ answer: string; sources: string[]; tool_called?: string }>,
): Promise<EvalResult[]> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Running evals: ${label} (${cases.length} cases)`);
  console.log('─'.repeat(60));

  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  ${evalCase.id}... `);
    const start = Date.now();

    try {
      const { answer, sources, tool_called } = await queryFn(evalCase.question);
      const score = await scoreResponse(
        evalCase.question,
        answer,
        sources,
        evalCase.expected_topics,
      );
      const latency_ms = Date.now() - start;

      results.push({
        case_id: evalCase.id,
        question: evalCase.question,
        answer,
        sources,
        tool_called,
        score,
        latency_ms,
      });

      const verdict = score.verdict === 'pass' ? '✓' : '✗';
      console.log(
        `${verdict} ${score.overall_score}/10 (${latency_ms}ms)${
          score.flags.length > 0 ? ` [${score.flags.join(', ')}]` : ''
        }`,
      );
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
  }

  return results;
}

// Report

function printReport(label: string, results: EvalResult[]) {
  const scores = results.map((result) => result.score.overall_score);
  const avg = scores.reduce((acc, score) => acc + score, 0) / scores.length;
  const passRate =
    results.filter((result) => result.score.verdict === 'pass').length /
    results.length;

  const avgAccuracy =
    results.reduce((avg, result) => avg + result.score.accuracy.score, 0) /
    results.length;
  const avgCitation =
    results.reduce(
      (avg, result) => avg + result.score.citation_quality.score,
      0,
    ) / results.length;
  const avgConfidence =
    results.reduce((avg, result) => avg + result.score.confidence.score, 0) /
    results.length;
  const avgLatency =
    results.reduce((avg, result) => avg + result.latency_ms, 0) /
    results.length;

  const allFlags = results.flatMap((result) => result.score.flags);
  const flagCounts = allFlags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag] = (acc[flag] ?? 0) + 1;
    return acc;
  }, {});

  const failures = results.filter((result) => result.score.verdict === 'fail');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`REPORT: ${label}`);
  console.log('═'.repeat(60));
  console.log(`Overall score:    ${avg.toFixed(1)}/10`);
  console.log(
    `Pass rate:        ${(passRate * 100).toFixed(0)}% (${
      results.filter((result) => result.score.verdict === 'pass').length
    }/${results.length})`,
  );
  console.log(`Avg latency:      ${avgLatency.toFixed(0)}ms`);
  console.log('');
  console.log(`Accuracy:         ${avgAccuracy.toFixed(1)}/10`);
  console.log(`Citation quality: ${avgCitation.toFixed(1)}/10`);
  console.log(`Confidence:       ${avgConfidence.toFixed(1)}/10`);

  if (Object.keys(flagCounts).length > 0) {
    console.log('\nTop failure modes:');
    Object.entries(flagCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([flag, count]) => console.log(`  ${flag}: ${count}`));
  }

  if (failures.length > 0) {
    console.log('\nFailed cases:');
    failures.forEach((failure) => {
      console.log(
        `  ${failure.case_id}: ${
          failure.score.overall_score
        }/10 — ${failure.question.slice(0, 60)}`,
      );
    });
  }
}

// Main function

async function main() {
  const pool = getPool();

  const ragResults = await runEvals('Basic RAG (03)', ragCases, runRagQuery);
  const agentResults = await runEvals(
    'Handbook Agent (06)',
    agentCases,
    runAgentQuery,
  );

  printReport('Basic RAG (03)', ragResults);
  printReport('Handbook Agent (06)', agentResults);

  // Side-by-side comparison
  const ragAvg =
    ragResults.reduce((acc, result) => acc + result.score.overall_score, 0) /
    ragResults.length;
  const agentAvg =
    agentResults.reduce((acc, result) => acc + result.score.overall_score, 0) /
    agentResults.length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('COMPARISON');
  console.log('═'.repeat(60));
  console.log(`Basic RAG avg:    ${ragAvg.toFixed(1)}/10`);
  console.log(`Agent avg:        ${agentAvg.toFixed(1)}/10`);
  console.log(
    `Delta:            ${agentAvg - ragAvg > 0 ? '+' : ''}${(
      agentAvg - ragAvg
    ).toFixed(1)}`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
