import { JOB_ERROR_MESSAGES, profileDraftWireSchema } from '@cl/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { AppDeps } from '../deps.js';
import { type ModelProvider, RETRYABLE_CODES } from '../model/provider.js';
import { PROFILE_PROMPT_VERSION, PROFILE_SYSTEM_PROMPT, profileUserPrompt } from '../prompts/profile.js';
import { getCharacter } from '../repos/characters.js';
import { totalSpentUsd } from '../repos/jobs.js';
import { setCallOutcome } from '../repos/model-calls.js';
import { failProfile, markProfilePending, saveProfile } from '../repos/profiles.js';
import { callModel } from './model-call.js';
import { parseProfile } from './profile-validation.js';

const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 3_000;
const BACKOFF_MS = 2_000;

/** Completes a character's card (SPEC §1.3a) in the background: at most 2 attempts within the job deadline. */
export class ProfileService {
  private readonly inFlight = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private closing = false;

  constructor(
    private readonly deps: AppDeps & { provider: ModelProvider; logger?: FastifyBaseLogger; sleep?: (ms: number) => Promise<void> },
  ) {}

  /** A previous process may have left profiles pending; they are failed, not retried. */
  recoverInterrupted(): void {
    this.deps.db
      .prepare(
        `UPDATE characters SET profile_status = CASE WHEN profile_json IS NULL THEN 'failed' ELSE 'ready' END, profile_error = ?
          WHERE profile_status = 'pending'`,
      )
      .run(JOB_ERROR_MESSAGES.SERVER_RESTART);
  }

  /** Starts completion unless one is already running. Returns false in that case. */
  start(characterId: string): boolean {
    if (this.closing || !markProfilePending(this.deps.db, characterId)) return false;
    const run = this.run(characterId).finally(() => this.inFlight.delete(run));
    this.inFlight.add(run);
    return true;
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    for (const c of this.controllers) c.abort();
    await this.idle();
  }

  private async run(characterId: string): Promise<void> {
    const { db, config, provider, now } = this.deps;
    const fail = (message: string) => failProfile(db, characterId, message);
    try {
      const character = getCharacter(db, characterId);
      if (!character) return;
      if (!provider.configured) return fail(JOB_ERROR_MESSAGES.MODEL_NOT_CONFIGURED);
      const model = provider.name === 'fixture' ? 'fixture' : config.storyModel;
      const deadline = Date.now() + config.jobDeadlineMs;
      let last = JOB_ERROR_MESSAGES.INTERNAL;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (this.closing) return fail(JOB_ERROR_MESSAGES.SERVER_RESTART);
        if (totalSpentUsd(db) >= config.budgetUsdCap) return fail(JOB_ERROR_MESSAGES.BUDGET_EXCEEDED);
        const remaining = deadline - Date.now();
        if (remaining < 1_000) break;
        const outcome = await callModel(
          { ...this.deps, controllers: this.controllers },
          {
            purpose: 'profile',
            model,
            system: PROFILE_SYSTEM_PROMPT,
            user: profileUserPrompt(character.card),
            schemaName: 'profile',
            jsonSchema: profileDraftWireSchema,
            maxTokens: MAX_TOKENS,
            trace: { storyId: '', chapterNumber: 0, characterName: character.card.name, directionText: null, knownKeys: [] },
          },
          { jobId: null, storyId: null, characterId, attempt, timeoutMs: Math.min(config.attemptTimeoutMs, remaining), promptVersion: PROFILE_PROMPT_VERSION },
        );
        if (outcome.kind === 'ok') {
          const parsed = parseProfile(outcome.response.text, character.card);
          if (parsed.ok) {
            saveProfile(db, characterId, { fields: parsed.fields, model, createdAt: now() });
            return;
          }
          setCallOutcome(db, outcome.callId, 'invalid', parsed.message);
          last = `${JOB_ERROR_MESSAGES.MODEL_INVALID_OUTPUT}：${parsed.message}`;
        } else {
          last = `${JOB_ERROR_MESSAGES[outcome.error.code]}：${outcome.error.message}`;
          if (!RETRYABLE_CODES.has(outcome.error.code)) break;
        }
        if (attempt < MAX_ATTEMPTS) await (this.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(BACKOFF_MS);
      }
      fail(last);
    } catch (err) {
      this.deps.logger?.error({ err, characterId }, 'profile completion failed');
      fail(`${JOB_ERROR_MESSAGES.INTERNAL}：${(err as Error).message}`);
    }
  }
}
