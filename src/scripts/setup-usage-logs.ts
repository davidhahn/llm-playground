import * as dotenv from 'dotenv';
import getPool from '../lib/db';

dotenv.config({ path: '.env.local' });

async function setup() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      label TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cost_usd NUMERIC(10, 6) NOT NULL,
      latency_ms INTEGER NOT NULL,
      stop_reason TEXT,
      metadata JSONB
    );

    CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx ON usage_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS usage_logs_label_idx ON usage_logs (label);
  `);

  console.log('usage_logs table ready.');
  await pool.end();
}

setup().catch(console.error);
