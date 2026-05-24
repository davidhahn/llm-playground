// import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import pool from '../lib/db';

dotenv.config({ path: '.env.local' });

// const anthropic = new Anthropic();
const openai = new OpenAI();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const documents = [
  {
    content:
      'The Anthropic API supports streaming responses using server-sent events. You can stream text completions token by token as they are generated.',
    metadata: { source: 'anthropic-docs', topic: 'streaming' },
  },
  {
    content:
      'Tool use allows Claude to call functions you define. The model returns a tool_use block with the function name and arguments, you execute it and return a tool_result.',
    metadata: { source: 'anthropic-docs', topic: 'tool-use' },
  },
  {
    content:
      'RAG stands for Retrieval Augmented Generation. It combines semantic search over a knowledge base with LLM generation to answer questions grounded in your own data.',
    metadata: { source: 'ai-concepts', topic: 'rag' },
  },
  {
    content:
      'pgvector is a Postgres extension for storing and querying vector embeddings. It supports exact and approximate nearest neighbor search using cosine, L2, and inner product distance.',
    metadata: { source: 'pgvector-docs', topic: 'vector-search' },
  },
  {
    content:
      'Embeddings are dense vector representations of text. Semantically similar text produces vectors that are close together in high-dimensional space, enabling similarity search.',
    metadata: { source: 'ai-concepts', topic: 'embeddings' },
  },
  {
    content:
      'The stop_reason field in an Anthropic API response indicates why the model stopped generating. Common values are end_turn (finished naturally) and tool_use (wants to call a tool).',
    metadata: { source: 'anthropic-docs', topic: 'stop-reason' },
  },
];

async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function seed() {
  console.log('Creating table...');
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(1536),
      metadata JSONB
    );

    CREATE INDEX IF NOT EXISTS documents_embedding_idx
      ON documents
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 10);
  `);

  // Clear existing rows so re-running the script stays idempotent
  await pool.query('TRUNCATE documents RESTART IDENTITY');
  console.log('Table ready.');

  for (const doc of documents) {
    console.log(`Embedding: "${doc.content.slice(0, 60)}..."`);
    const embedding = await embedText(doc.content);

    await pool.query(
      'INSERT INTO documents (content, embedding, metadata) VALUES ($1, $2, $3)',
      [doc.content, JSON.stringify(embedding), doc.metadata],
    );
  }

  console.log(`\nSeeded ${documents.length} documents.`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
