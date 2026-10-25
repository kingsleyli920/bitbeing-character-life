import { type Job, type JobErrorCode, type JobStatus, type JobUsage } from '@cl/shared';
import type { Db } from '../db/open.js';

export interface JobRow {
  id: string;
  story_id: string;
  request_id: string;
  status: JobStatus;
  base_version: number;
  target_chapter: number;
  direction_id: string | null;
  model: string;
  prompt_version: string;
  attempts: number;
  error_code: JobErrorCode | null;
  error_message: string | null;
  warnings: string | null;
  context_stats: string | null;
  chapter_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface UsageRow {
  calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
  reported: number;
  estimated: number;
}

function usageFor(db: Db, row: JobRow): JobUsage {
  const u = db
    .prepare(
      `SELECT COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
              SUM(reasoning_tokens) AS reasoning_tokens, SUM(cost_usd) AS cost_usd,
              SUM(cost_source = 'reported') AS reported, SUM(cost_source = 'estimated') AS estimated
         FROM model_calls WHERE story_id = ? AND job_id = ?`,
    )
    .get(row.story_id, row.id) as unknown as UsageRow;
  const costSource: JobUsage['costSource'] =
    u.calls === 0 || u.reported + u.estimated === 0
      ? 'unknown'
      : u.reported === u.calls
        ? 'reported'
        : u.estimated === u.calls
          ? 'estimated'
          : 'mixed';
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    reasoningTokens: u.reasoning_tokens,
    costUsd: u.cost_usd,
    costSource,
    latencyMs:
      row.started_at && row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.started_at) : null,
  };
}

export function toJob(db: Db, row: JobRow): Job {
  return {
    id: row.id,
    storyId: row.story_id,
    requestId: row.request_id,
    status: row.status,
    targetChapter: row.target_chapter,
    directionId: row.direction_id,
    model: row.model,
    promptVersion: row.prompt_version,
    attempts: row.attempts,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    warnings: row.warnings ? (JSON.parse(row.warnings) as string[]) : [],
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    usage: usageFor(db, row),
  };
}

export function getJobRow(db: Db, storyId: string, jobId: string): JobRow | undefined {
  return db.prepare('SELECT * FROM jobs WHERE story_id = ? AND id = ?').get(storyId, jobId) as JobRow | undefined;
}

export function getActiveJobRow(db: Db, storyId: string): JobRow | undefined {
  return db
    .prepare(`SELECT * FROM jobs WHERE story_id = ? AND status IN ('queued', 'running')`)
    .get(storyId) as JobRow | undefined;
}

export function getLastJobRow(db: Db, storyId: string): JobRow | undefined {
  return db
    .prepare('SELECT * FROM jobs WHERE story_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get(storyId) as JobRow | undefined;
}

/** Total spend on real model calls (for the budget cap and /api/meta). */
export function totalSpentUsd(db: Db): number {
  const row = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM model_calls').get() as { spent: number };
  return row.spent;
}
