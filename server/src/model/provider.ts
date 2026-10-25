import type { JobErrorCode } from '@cl/shared';

export type ModelPurpose = 'chapter' | 'arc_summary' | 'profile';
export type CostSource = 'reported' | 'estimated' | 'unknown';

export interface ModelRequest {
  purpose: ModelPurpose;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  signal: AbortSignal;
  /** Not sent to the model; lets the fixture provider produce plausible content and tests assert on calls. */
  trace: {
    storyId: string;
    chapterNumber: number;
    characterName: string;
    directionText: string | null;
    knownKeys: string[];
  };
}

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  costSource: CostSource;
}

export interface ModelResponse {
  text: string;
  finishReason: string | null;
  provider: string | null;
  usage: ModelUsage;
}

export class ModelError extends Error {
  constructor(
    readonly code: JobErrorCode,
    message: string,
    readonly opts: { retryAfterMs?: number; usage?: ModelUsage; provider?: string | null; responseText?: string } = {},
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export const RETRYABLE_CODES: ReadonlySet<JobErrorCode> = new Set([
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'MODEL_INVALID_OUTPUT',
  'MODEL_TRUNCATED',
]);

export interface ModelProvider {
  readonly name: 'openrouter' | 'fixture';
  /** False when a required credential is missing; the runner fails jobs with MODEL_NOT_CONFIGURED. */
  readonly configured: boolean;
  complete(req: ModelRequest): Promise<ModelResponse>;
}

export const UNKNOWN_USAGE: ModelUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  costUsd: null,
  costSource: 'unknown',
};
