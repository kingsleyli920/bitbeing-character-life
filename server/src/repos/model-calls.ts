import { randomUUID } from 'node:crypto';
import type { Db } from '../db/open.js';
import type { ModelPurpose, ModelUsage } from '../model/provider.js';

export type CallOutcome = 'ok' | 'error' | 'invalid' | 'discarded';

export interface ModelCallRecord {
  jobId: string | null;
  storyId: string | null;
  characterId: string | null;
  purpose: ModelPurpose;
  attempt: number;
  model: string;
  provider: string | null;
  promptVersion: string;
  startedAt: string;
  latencyMs: number;
  outcome: CallOutcome;
  errorCode: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  usage: ModelUsage;
  requestJson: string;
  responseText: string | null;
}

export function insertModelCall(db: Db, r: ModelCallRecord): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO model_calls (id, job_id, story_id, character_id, purpose, attempt, model, provider, prompt_version, started_at,
       latency_ms, outcome, error_code, error_message, finish_reason, input_tokens, output_tokens, reasoning_tokens, cost_usd,
       cost_source, request_json, response_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    r.jobId,
    r.storyId,
    r.characterId,
    r.purpose,
    r.attempt,
    r.model,
    r.provider,
    r.promptVersion,
    r.startedAt,
    r.latencyMs,
    r.outcome,
    r.errorCode,
    r.errorMessage,
    r.finishReason,
    r.usage.inputTokens,
    r.usage.outputTokens,
    r.usage.reasoningTokens,
    r.usage.costUsd,
    r.usage.costSource,
    r.requestJson,
    r.responseText,
  );
  return id;
}

/** Marks a recorded call as invalid/discarded, keeping the reason for later diagnosis. */
export function setCallOutcome(db: Db, callId: string, outcome: CallOutcome, message?: string): void {
  db.prepare('UPDATE model_calls SET outcome = ?, error_message = COALESCE(?, error_message) WHERE id = ?').run(outcome, message ?? null, callId);
}

export function countModelCalls(db: Db, storyId: string, jobId?: string): number {
  const row = (
    jobId
      ? db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE story_id = ? AND job_id = ?').get(storyId, jobId)
      : db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE story_id = ?').get(storyId)
  ) as { n: number };
  return row.n;
}
