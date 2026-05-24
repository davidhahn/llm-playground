import getPool from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic();
const openai = new OpenAI();

async function embedQuery(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function retrieveChunks(embedding: number[], topK = 3) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT content, metadata, 1 - (embedding <=> $1::vector) AS similarity
     FROM documents
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), topK],
  );
  return result.rows;
}

export async function POST(req: Request) {
  const { message } = await req.json();

  // embed the query
  const queryEmbedding = await embedQuery(message);
  // retrieve the most relevant chunks
  const chunks = await retrieveChunks(queryEmbedding);
  // build the prompt with retrieved context
  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] (source: ${chunk.metadata.source})\n${chunk.content}`,
    )
    .join('\n\n');

  const systemPrompt = `You are a helpful assistant. Answer the user's question using only the context provided below. If the answer isn't in the context, say so — don't make anything up.

Context:
${context}`;

  // stream the grounded response
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      // send the retrieved chunks first so the frontend can show sources
      send({
        type: 'sources',
        chunks: chunks.map((c) => ({
          content: c.content,
          source: c.metadata.source,
          topic: c.metadata.topic,
          similarity: Number(c.similarity).toFixed(3),
        })),
      });

      // stream the generated response
      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          send({ type: 'text', content: chunk.delta.text });
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
