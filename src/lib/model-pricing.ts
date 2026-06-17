// Pricing per million tokens as of June 2026
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5': { input: 1.0, output: 5.0 },
    'claude-opus-4-8': { input: 5.0, output: 25.0 },
  };

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function formatCost(costUsd: number): string {
  if (costUsd < 0.000001) return '<$0.000001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(6)}`;
  return `$${costUsd.toFixed(4)}`;
}
