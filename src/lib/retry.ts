export type RetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    // Anthropic API error codes that are safe to retry
    const message = error.message.toLowerCase();
    if (message.includes('529') || message.includes('overloaded')) {
      return true;
    }

    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    if (message.includes('network') || message.includes('econnreset')) {
      return true;
    }

    if (message.includes('503') || message.includes('502')) {
      return true;
    }
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = isTransientError,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt || !shouldRetry(error, attempt)) {
        throw error;
      }

      // exponential backoff with jitter
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs,
      );
      const jitter = Math.random() * 0.3 * baseDelay;
      const delayMs = Math.round(baseDelay + jitter);

      onRetry?.(error, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new RetryError(
    `Failed after ${maxAttempts} attempts`,
    maxAttempts,
    lastError,
  );
}
