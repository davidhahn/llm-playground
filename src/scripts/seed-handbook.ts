import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import getPool from '../lib/db';

dotenv.config({ path: '.env.local' });

const openai = new OpenAI();

const handbook = [
  {
    content:
      'Acme Corp offers 15 days of paid time off (PTO) per year for employees in their first two years, 20 days for employees with 2-5 years of tenure, and 25 days for employees with 5+ years. PTO resets on January 1st each year and does not roll over.',
    metadata: { source: 'handbook', section: 'time-off', topic: 'pto-policy' },
  },
  {
    content:
      'To request time off, employees must submit a request in Workday at least 5 business days in advance for requests under 3 days, and at least 10 business days in advance for longer requests. Requests must be approved by your direct manager.',
    metadata: {
      source: 'handbook',
      section: 'time-off',
      topic: 'pto-request-process',
    },
  },
  {
    content:
      "Acme Corp observes 11 federal holidays per year. These are separate from PTO and do not count against an employee's PTO balance. Employees required to work on a federal holiday receive 1.5x their standard daily rate as compensation.",
    metadata: { source: 'handbook', section: 'time-off', topic: 'holidays' },
  },
  {
    content:
      'The engineering on-call rotation runs in one-week increments starting Monday at 9am. On-call engineers are expected to respond to P1 incidents within 15 minutes and P2 incidents within 1 hour. On-call compensation is an additional $500 per week.',
    metadata: { source: 'handbook', section: 'engineering', topic: 'on-call' },
  },
  {
    content:
      'Acme Corp provides a $2,000 annual learning and development budget per employee. This can be used for courses, books, conferences, or certifications. Expenses must be pre-approved by your manager and submitted via Expensify within 30 days of purchase.',
    metadata: {
      source: 'handbook',
      section: 'benefits',
      topic: 'learning-budget',
    },
  },
  {
    content:
      "Remote work policy: Employees may work remotely up to 3 days per week. Core hours are 10am-3pm in the employee's local timezone. Employees must be available via Slack during core hours and attend all required meetings regardless of location.",
    metadata: {
      source: 'handbook',
      section: 'remote-work',
      topic: 'remote-policy',
    },
  },
  {
    content:
      'Performance reviews are conducted twice per year — in June and December. Each review involves a self-assessment, peer feedback from 3 colleagues, and a manager evaluation. Compensation adjustments are tied to the December review cycle.',
    metadata: {
      source: 'handbook',
      section: 'performance',
      topic: 'review-cycle',
    },
  },
  {
    content:
      'Parental leave policy: Primary caregivers receive 16 weeks of fully paid leave. Secondary caregivers receive 6 weeks of fully paid leave. Leave must be taken within 12 months of the birth or adoption. Employees must notify HR at least 8 weeks in advance.',
    metadata: {
      source: 'handbook',
      section: 'benefits',
      topic: 'parental-leave',
    },
  },
  {
    content:
      'Equipment policy: New employees receive a MacBook Pro and standard peripherals. Replacement equipment is available after 3 years or if the device is damaged. Employees must return all equipment within 5 business days of their last day.',
    metadata: { source: 'handbook', section: 'it', topic: 'equipment' },
  },
  {
    content:
      'Expense reimbursement: Expenses under $50 can be submitted without prior approval. Expenses between $50-$500 require manager approval. Expenses over $500 require both manager and finance approval. All expenses must be submitted within 30 days.',
    metadata: { source: 'handbook', section: 'finance', topic: 'expenses' },
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
  const pool = getPool();

  console.log('Creating handbook table...');
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS handbook (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(1536),
      metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS handbook_embedding_idx
      ON handbook
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 10);
  `);

  await pool.query('TRUNCATE handbook RESTART IDENTITY');
  console.log('Table ready.');

  for (const doc of handbook) {
    console.log(`Embedding: "${doc.content.slice(0, 60)}..."`);
    const embedding = await embedText(doc.content);
    const vectorString = `[${embedding.join(',')}]`;
    await pool.query(
      'INSERT INTO handbook (content, embedding, metadata) VALUES ($1, $2::vector, $3)',
      [doc.content, vectorString, doc.metadata],
    );
  }

  console.log(`\nSeeded ${handbook.length} handbook entries.`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
