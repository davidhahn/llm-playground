import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import getPool from './db';
import { calculateCost, formatCost } from './model-pricing';

export type UsageLog = {
  label: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  stop_reason?: string;
  metadata?: Record<string, unknown>;
};

async function persistLog(log: UsageLog, pool: Pool): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO usage_logs
       (label, model, input_tokens, output_tokens, total_tokens, cost_usd, latency_ms, stop_reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        log.label,
        log.model,
        log.input_tokens,
        log.output_tokens,
        log.total_tokens,
        log.cost_usd,
        log.latency_ms,
        log.stop_reason ?? null,
        log.metadata ?? null,
      ],
    );
  } catch (error) {
    // don't let logging failures break the main flow
    console.error('Failed to persist usage log:', error);
  }
}

function consoleLog(log: UsageLog): void {
  console.log(
    `[usage] ${log.label} | ${log.model} | ` +
      `in:${log.input_tokens} out:${log.output_tokens} | ` +
      `${formatCost(log.cost_usd)} | ${log.latency_ms}ms | ` +
      `stop:${log.stop_reason ?? 'unknown'}`,
  );
}

// Wraps a streaming API call and captures usage from stream events
export async function trackStream(
  label: string,
  streamFn: () =>
    | AsyncIterable<Anthropic.MessageStreamEvent>
    | Promise<AsyncIterable<Anthropic.MessageStreamEvent>>,
  options: {
    metadata?: Record<string, unknown>;
    persist?: boolean;
  } = {},
): Promise<{
  stream: AsyncIterable<Anthropic.MessageStreamEvent>;
  getLog: () => UsageLog | null;
}> {
  const { metadata, persist = true } = options;
  const startTime = Date.now();

  let inputTokens = 0;
  let outputTokens = 0;
  let model = '';
  let stopReason = '';
  let log: UsageLog | null = null;

  const rawStream = await streamFn();
  const pool = getPool();

  // wrap the stream to intercept token usage events
  async function* wrappedStream() {
    for await (const chunk of rawStream) {
      // capture model from message_start
      if (chunk.type === 'message_start') {
        model = chunk.message.model;
        inputTokens = chunk.message.usage.input_tokens;
      }

      // capture output tokens and stop reason from message_delta
      if (chunk.type === 'message_delta') {
        outputTokens = chunk.usage.output_tokens;
        stopReason = chunk.delta.stop_reason ?? '';
      }

      // yield every chunk unchanged — transparent to the caller
      yield chunk;
    }

    // stream is done — compute and persist
    const latencyMs = Date.now() - startTime;
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    log = {
      label,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      cost_usd: costUsd,
      latency_ms: latencyMs,
      stop_reason: stopReason,
      metadata,
    };

    consoleLog(log);
    if (persist) {
      await persistLog(log, pool);
    }
  }

  return {
    stream: wrappedStream(),
    getLog: () => log,
  };
}

// for non-streaming calls (evals, structured output)
export async function trackCreate<
  T extends {
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
    stop_reason?: string;
  },
>(
  label: string,
  createFn: () => Promise<T>,
  options: {
    metadata?: Record<string, unknown>;
    persist?: boolean;
  } = {},
): Promise<T> {
  const { metadata, persist = true } = options;
  const startTime = Date.now();
  const pool = getPool();

  const response = await createFn();

  const latencyMs = Date.now() - startTime;
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = calculateCost(response.model, inputTokens, outputTokens);

  const log: UsageLog = {
    label,
    model: response.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_usd: costUsd,
    latency_ms: latencyMs,
    stop_reason: response.stop_reason,
    metadata,
  };

  consoleLog(log);
  if (persist) {
    await persistLog(log, pool);
  }

  return response;
}
