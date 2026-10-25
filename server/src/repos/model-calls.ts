import { randomUUID } from 'node:crypto';
import type { Db } from '../db/open.js';
import type { ModelPurpose, ModelUsage } from '../model/provider.js';

export type CallOutcome = 'ok' | 'error' | 'invalid' | 'discarded';

export interface ModelCallRecord {
  jobId: string;
  storyId: string;
  purpose: ModelPurpose;
  attempt: number;
  model: string;
  provider: string | null;
  promptVersion: string;
  startedAt: string;
  latencyMs: number;
  outcome: CallOutcome;
  errorCode: string | null;
  finishReason: string | null;
  usage: ModelUsage;
  requestJson: string;
  responseText: string | null;
}

export function insertModelCall(db: Db, r: ModelCallRecord): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO model_calls (id, job_id, story_id, purpose, attempt, model, provider, prompt_version, started_at,
       latency_ms, outcome, error_code, finish_reason, input_tokens, output_tokens, reasoning_tokens, cost_usd,
       cost_source, request_json, response_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    r.jobId,
    r.storyId,
    r.purpose,
    r.attempt,
    r.model,
    r.provider,
    r.promptVersion,
    r.startedAt,
    r.latencyMs,
    r.outcome,
    r.errorCode,
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

export function setCallOutcome(db: Db, storyId: string, callId: string, outcome: CallOutcome): void {
  db.prepare('UPDATE model_calls SET outcome = ? WHERE story_id = ? AND id = ?').run(outcome, storyId, callId);
}

export function countModelCalls(db: Db, storyId: string, jobId?: string): number {
  const row = (
    jobId
      ? db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE story_id = ? AND job_id = ?').get(storyId, jobId)
      : db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE story_id = ?').get(storyId)
  ) as { n: number };
  return row.n;
}
