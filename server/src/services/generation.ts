import { randomUUID } from 'node:crypto';
import {
  arcSummarySchema,
  arcSummaryWireSchema,
  chapterDraftWireSchema,
  type ChapterDraft,
  type JobErrorCode,
  JOB_ERROR_MESSAGES,
} from '@cl/shared';
import type { FastifyBaseLogger } from 'fastify';
import { isUniqueViolation, transaction } from '../db/open.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http-errors.js';
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse, RETRYABLE_CODES } from '../model/provider.js';
import { ARC_SYSTEM_PROMPT, CHAPTER_SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/chapter.js';
import { insertChapter } from '../repos/chapters.js';
import { getDirection } from '../repos/directions.js';
import { getActiveJobRow, getJobRow, type JobRow, toJob, totalSpentUsd } from '../repos/jobs.js';
import { insertArcSummary, insertTraitChange, listMemories } from '../repos/memories.js';
import { insertModelCall, setCallOutcome } from '../repos/model-calls.js';
import { getStory, type StoryRecord } from '../repos/stories.js';
import { arcPrompt, missingArc } from './arc-summary.js';
import { assembleContext, estimateTokens } from './context-builder.js';
import { loadContextData } from './context-loader.js';
import { parseDraft } from './draft-validation.js';
import { applyMemoryOps } from './memory-apply.js';

export interface GenerationDeps extends AppDeps {
  provider: ModelProvider;
  logger?: FastifyBaseLogger;
  /** Waits between retries; injectable so tests do not sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const BACKOFF_MS = [2_000, 5_000];
const MAX_RETRY_AFTER_MS = 20_000;
const CHAPTER_MAX_TOKENS = 8_000;
const ARC_MAX_TOKENS = 1_500;
const ARC_TIMEOUT_MS = 30_000;

type CommitOutcome = 'committed' | 'stale' | 'discarded';

/**
 * Runs chapter generation jobs inside the server process (SPEC §3). One active job per story is
 * enforced by the database; this class only schedules work and owns the attempt loop.
 */
export class GenerationService {
  private readonly queue: { storyId: string; jobId: string }[] = [];
  private readonly inFlight = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private active = 0;
  private closing = false;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: GenerationDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Marks jobs left queued/running by a previous process as interrupted (T6). Never re-runs them. */
  recoverInterrupted(): number {
    const { db, now } = this.deps;
    const result = db
      .prepare(
        `UPDATE jobs SET status = 'interrupted', error_code = 'SERVER_RESTART', error_message = ?, finished_at = ?
          WHERE status IN ('queued', 'running')`,
      )
      .run(JOB_ERROR_MESSAGES.SERVER_RESTART, now());
    return Number(result.changes);
  }

  /** Creates (or returns the existing) job for this request id (T1), or 409 if another job is active (T2). */
  createJob(storyId: string, requestId: string): { job: JobRow; created: boolean } {
    const { db, now } = this.deps;
    return transaction(db, () => {
      const story = getStory(db, storyId);
      if (!story) throw notFound('故事');
      const id = randomUUID();
      try {
        db.prepare(
          `INSERT INTO jobs (id, story_id, request_id, status, base_version, target_chapter, direction_id, model, prompt_version, created_at)
           VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          storyId,
          requestId,
          story.version,
          story.chapterCount + 1,
          story.activeDirectionId,
          this.modelName(),
          PROMPT_VERSION,
          now(),
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const same = db.prepare('SELECT * FROM jobs WHERE story_id = ? AND request_id = ?').get(storyId, requestId) as
          | JobRow
          | undefined;
        if (same) return { job: same, created: false };
        const active = getActiveJobRow(db, storyId)!;
        throw new HttpError(409, 'JOB_IN_PROGRESS', `第 ${active.target_chapter} 章正在生成，请等待完成`, {
          job: toJob(db, active),
        });
      }
      return { job: getJobRow(db, storyId, id)!, created: true };
    });
  }

  enqueue(storyId: string, jobId: string): void {
    if (this.closing) return;
    this.queue.push({ storyId, jobId });
    this.pump();
  }

  /** Resolves when no job is queued or running (tests). */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0 || this.queue.length > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  /** Stops scheduling, aborts in-flight model calls and marks their jobs interrupted. */
  async shutdown(): Promise<void> {
    this.closing = true;
    this.queue.length = 0;
    for (const c of this.controllers) c.abort();
    await Promise.allSettled([...this.inFlight]);
  }

  private modelName(): string {
    return this.deps.provider.name === 'fixture' ? 'fixture' : this.deps.config.storyModel;
  }

  private pump(): void {
    while (!this.closing && this.active < this.deps.config.jobConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.active++;
      const run = this.run(next.storyId, next.jobId)
        .catch((err) => this.deps.logger?.error({ err, jobId: next.jobId }, 'generation job crashed'))
        .finally(() => {
          this.active--;
          this.inFlight.delete(run);
          this.pump();
        });
      this.inFlight.add(run);
    }
  }

  private finish(storyId: string, jobId: string, status: 'failed' | 'interrupted', code: JobErrorCode, message?: string): void {
    const { db, now } = this.deps;
    db.prepare(
      `UPDATE jobs SET status = ?, error_code = ?, error_message = ?, finished_at = ?
        WHERE story_id = ? AND id = ? AND status = 'running'`,
    ).run(status, code, message ?? JOB_ERROR_MESSAGES[code], now(), storyId, jobId);
    this.deps.logger?.info({ jobId, status, code }, 'generation job finished');
  }

  private async run(storyId: string, jobId: string): Promise<void> {
    const { db, config, now, provider } = this.deps;
    const started = db
      .prepare(`UPDATE jobs SET status = 'running', started_at = ? WHERE story_id = ? AND id = ? AND status = 'queued'`)
      .run(now(), storyId, jobId);
    if (Number(started.changes) === 0) return;
    const deadline = Date.now() + config.jobDeadlineMs;

    try {
      const job = getJobRow(db, storyId, jobId)!;
      const story = getStory(db, storyId);
      if (!story) return;
      if (!provider.configured) return this.finish(storyId, jobId, 'failed', 'MODEL_NOT_CONFIGURED');

      const direction = job.direction_id ? (getDirection(db, storyId, job.direction_id) ?? null) : null;
      await this.ensureArcSummary(job, story, deadline);
      if (this.closing) return this.finish(storyId, jobId, 'interrupted', 'SERVER_RESTART');
      const context = assembleContext(loadContextData(db, story, job.target_chapter, direction), {
        budgetTokens: config.contextBudgetTokens,
        systemTokens: estimateTokens(CHAPTER_SYSTEM_PROMPT),
      });
      db.prepare('UPDATE jobs SET context_stats = ? WHERE story_id = ? AND id = ?').run(
        JSON.stringify({
          budgetTokens: context.budgetTokens,
          totalTokens: context.totalTokens,
          sections: context.sections,
          includedMemoryKeys: context.includedMemoryKeys,
          referencedChapters: context.referencedChapters,
        }),
        storyId,
        jobId,
      );
      const knownKeys = listMemories(db, storyId)
        .filter((m) => m.status !== 'resolved')
        .map((m) => m.key);
      const baseRequest = {
        purpose: 'chapter' as const,
        model: job.model,
        system: CHAPTER_SYSTEM_PROMPT,
        user: context.user,
        schemaName: 'chapter',
        jsonSchema: chapterDraftWireSchema,
        maxTokens: CHAPTER_MAX_TOKENS,
        trace: {
          storyId,
          chapterNumber: job.target_chapter,
          characterName: story.card.name,
          directionText: direction?.text ?? null,
          knownKeys,
        },
      };

      let lastError = new ModelError('INTERNAL', JOB_ERROR_MESSAGES.INTERNAL);
      const minAttemptMs = Math.min(5_000, config.attemptTimeoutMs / 2);
      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        if (this.closing) return this.finish(storyId, jobId, 'interrupted', 'SERVER_RESTART');
        if (totalSpentUsd(db) >= config.budgetUsdCap) {
          return this.finish(storyId, jobId, 'failed', 'BUDGET_EXCEEDED', `已达到本地费用上限 $${config.budgetUsdCap}`);
        }
        const remaining = deadline - Date.now();
        if (attempt > 1 && remaining < minAttemptMs) break;
        db.prepare('UPDATE jobs SET attempts = ? WHERE story_id = ? AND id = ?').run(attempt, storyId, jobId);

        const outcome = await this.attempt({ ...baseRequest }, { storyId, jobId, attempt, timeoutMs: Math.min(config.attemptTimeoutMs, Math.max(remaining, 1)) });
        if (outcome.kind === 'ok') {
          const parsed = parseDraft(outcome.response.text, { chapterNumber: job.target_chapter, hasDirection: Boolean(direction) });
          if (parsed.ok) {
            const result = this.commit(job, parsed.draft, parsed.warnings);
            if (result === 'discarded') setCallOutcome(db, storyId, outcome.callId, 'discarded');
            return;
          }
          setCallOutcome(db, storyId, outcome.callId, 'invalid');
          lastError = new ModelError('MODEL_INVALID_OUTPUT', parsed.message);
          this.deps.logger?.warn({ jobId, attempt, reason: parsed.message }, 'invalid model output');
        } else {
          lastError = outcome.error;
        }
        if (this.closing) return this.finish(storyId, jobId, 'interrupted', 'SERVER_RESTART');
        if (!RETRYABLE_CODES.has(lastError.code)) break;
        if (attempt < config.maxAttempts) {
          const wait = Math.min(lastError.opts.retryAfterMs ?? BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1)!, MAX_RETRY_AFTER_MS);
          if (Date.now() + wait + minAttemptMs > deadline) break;
          await this.sleep(wait);
        }
      }
      this.finish(storyId, jobId, 'failed', lastError.code, `${JOB_ERROR_MESSAGES[lastError.code]}：${lastError.message}`);
    } catch (err) {
      this.deps.logger?.error({ err, jobId }, 'generation job failed unexpectedly');
      this.finish(storyId, jobId, 'failed', 'INTERNAL', `${JOB_ERROR_MESSAGES.INTERNAL}：${(err as Error).message}`);
    }
  }

  /**
   * Before chapter 10k+1, summarise the earliest complete block of 10 chapters that has no arc
   * summary (SPEC §2.4). One attempt only; failure never blocks the chapter (the context loader
   * falls back to stitched chapter summaries and the next job tries again).
   */
  private async ensureArcSummary(job: JobRow, story: StoryRecord, deadline: number): Promise<void> {
    const { db, config, now } = this.deps;
    const gap = missingArc(db, story.id, job.target_chapter);
    if (!gap || totalSpentUsd(db) >= config.budgetUsdCap) return;
    // Leave the chapter itself at least one full attempt.
    const timeoutMs = Math.min(ARC_TIMEOUT_MS, config.attemptTimeoutMs, deadline - Date.now() - config.attemptTimeoutMs);
    if (timeoutMs < 1_000) return;
    const outcome = await this.attempt(
      {
        purpose: 'arc_summary',
        model: job.model,
        system: ARC_SYSTEM_PROMPT,
        user: arcPrompt(db, story.id, story.card.name, gap.from, gap.to),
        schemaName: 'arc_summary',
        jsonSchema: arcSummaryWireSchema,
        maxTokens: ARC_MAX_TOKENS,
        trace: { storyId: story.id, chapterNumber: job.target_chapter, characterName: story.card.name, directionText: null, knownKeys: [] },
      },
      { storyId: story.id, jobId: job.id, attempt: 0, timeoutMs },
    );
    if (outcome.kind === 'error') {
      this.deps.logger?.warn({ jobId: job.id, code: outcome.error.code, arc: gap }, 'arc summary failed; using stitched summaries');
      return;
    }
    let parsed: ReturnType<typeof arcSummarySchema.safeParse>;
    try {
      parsed = arcSummarySchema.safeParse(JSON.parse(outcome.response.text));
    } catch {
      parsed = arcSummarySchema.safeParse(null);
    }
    if (!parsed.success) {
      setCallOutcome(db, story.id, outcome.callId, 'invalid');
      return;
    }
    insertArcSummary(db, story.id, gap.from, gap.to, parsed.data.summary, now());
  }

  /** One model call with its own timeout; always records a model_calls row. */
  private async attempt(
    base: Omit<ModelRequest, 'signal'>,
    meta: { storyId: string; jobId: string; attempt: number; timeoutMs: number },
  ): Promise<{ kind: 'ok'; response: ModelResponse; callId: string } | { kind: 'error'; error: ModelError }> {
    const { db, now, provider } = this.deps;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), meta.timeoutMs);
    const startedAt = now();
    const t0 = Date.now();
    const aborted = new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(new ModelError('MODEL_TIMEOUT', '模型响应超时'))),
    );
    aborted.catch(() => undefined);
    let response: ModelResponse | undefined;
    let error: ModelError | undefined;
    try {
      response = await Promise.race([provider.complete({ ...base, signal: controller.signal }), aborted]);
    } catch (err) {
      error = err instanceof ModelError ? err : new ModelError('INTERNAL', (err as Error).message);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
    const callId = insertModelCall(db, {
      jobId: meta.jobId,
      storyId: meta.storyId,
      purpose: base.purpose,
      attempt: meta.attempt,
      model: base.model,
      provider: response?.provider ?? error?.opts.provider ?? null,
      promptVersion: PROMPT_VERSION,
      startedAt,
      latencyMs: Date.now() - t0,
      outcome: response ? 'ok' : 'error',
      errorCode: error?.code ?? null,
      finishReason: response?.finishReason ?? null,
      usage: response?.usage ?? error?.opts.usage ?? { inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, costSource: 'unknown' },
      requestJson: JSON.stringify({ model: base.model, system: base.system, user: base.user, maxTokens: base.maxTokens }),
      responseText: response?.text ?? error?.opts.responseText ?? null,
    });
    this.deps.logger?.info(
      { jobId: meta.jobId, attempt: meta.attempt, model: base.model, promptVersion: PROMPT_VERSION, latencyMs: Date.now() - t0, errorCode: error?.code },
      'model call',
    );
    return response ? { kind: 'ok', response, callId } : { kind: 'error', error: error! };
  }

  /**
   * Saves the chapter and every state change in one transaction (T8), only if this job still owns
   * the next chapter (T3). Throws on a database error, which rolls everything back.
   */
  private commit(job: JobRow, draft: ChapterDraft, draftWarnings: string[] = []): CommitOutcome {
    const { db, now } = this.deps;
    const storyId = job.story_id;
    return transaction(db, () => {
      const current = getJobRow(db, storyId, job.id);
      if (current?.status !== 'running') {
        this.deps.logger?.warn({ jobId: job.id, status: current?.status }, 'late result discarded');
        return 'discarded';
      }
      const story = getStory(db, storyId);
      if (!story || story.version !== job.base_version || story.chapterCount + 1 !== job.target_chapter) {
        db.prepare(
          `UPDATE jobs SET status = 'stale', error_code = 'STALE', error_message = ?, finished_at = ? WHERE story_id = ? AND id = ?`,
        ).run(JOB_ERROR_MESSAGES.STALE, now(), storyId, job.id);
        return 'stale';
      }
      const time = now();
      const chapterId = randomUUID();
      insertChapter(db, storyId, { id: chapterId, number: job.target_chapter, draft, directionId: job.direction_id, jobId: job.id, now: time });
      const warnings = [...draftWarnings, ...applyMemoryOps(db, storyId, job.target_chapter, draft.memoryOps, time)];
      for (const change of draft.traitChanges) insertTraitChange(db, storyId, job.target_chapter, change);
      db.prepare(
        `UPDATE stories SET state = ?, version = version + 1, chapter_count = chapter_count + 1, updated_at = ?
          WHERE id = ? AND version = ?`,
      ).run(JSON.stringify(draft.state), time, storyId, job.base_version);
      db.prepare(
        `UPDATE jobs SET status = 'succeeded', chapter_id = ?, warnings = ?, finished_at = ? WHERE story_id = ? AND id = ?`,
      ).run(chapterId, JSON.stringify(warnings), time, storyId, job.id);
      return 'committed';
    });
  }
}
