export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * USD per million tokens, from https://openrouter.ai/api/v1/models on 2026-10-24.
 * Only used when OpenRouter does not report `usage.cost`; such costs are marked "estimated".
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  'anthropic/claude-haiku-5.5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'deepseek/deepseek-v4-pro': { inputPerMTok: 0.209, outputPerMTok: 0.418 },
};
