import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/open.js';
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse, UNKNOWN_USAGE } from '../model/provider.js';
import { insertModelCall } from '../repos/model-calls.js';

export type CallOutcome = { kind: 'ok'; response: ModelResponse; callId: string } | { kind: 'error'; error: ModelError };

export interface CallMeta {
  jobId: string | null;
  storyId: string | null;
  characterId: string | null;
  attempt: number;
  timeoutMs: number;
  promptVersion: string;
}

/**
 * One model call with its own timeout. Always records a model_calls row (success or failure), and
 * stops waiting when the timeout fires even if the provider ignores the abort signal.
 */
export async function callModel(
  deps: { db: Db; now: () => string; provider: ModelProvider; logger?: FastifyBaseLogger; controllers?: Set<AbortController> },
  base: Omit<ModelRequest, 'signal'>,
  meta: CallMeta,
): Promise<CallOutcome> {
  const controller = new AbortController();
  deps.controllers?.add(controller);
  const timer = setTimeout(() => controller.abort(), meta.timeoutMs);
  const startedAt = deps.now();
  const t0 = Date.now();
  const aborted = new Promise<never>((_, reject) =>
    controller.signal.addEventListener('abort', () => reject(new ModelError('MODEL_TIMEOUT', '模型响应超时'))),
  );
  aborted.catch(() => undefined);
  let response: ModelResponse | undefined;
  let error: ModelError | undefined;
  try {
    response = await Promise.race([deps.provider.complete({ ...base, signal: controller.signal }), aborted]);
  } catch (err) {
    error = err instanceof ModelError ? err : new ModelError('INTERNAL', (err as Error).message);
  } finally {
    clearTimeout(timer);
    deps.controllers?.delete(controller);
  }
  const latencyMs = Date.now() - t0;
  const callId = insertModelCall(deps.db, {
    jobId: meta.jobId,
    storyId: meta.storyId,
    characterId: meta.characterId,
    purpose: base.purpose,
    attempt: meta.attempt,
    model: base.model,
    provider: response?.provider ?? error?.opts.provider ?? null,
    promptVersion: meta.promptVersion,
    startedAt,
    latencyMs,
    outcome: response ? 'ok' : 'error',
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    finishReason: response?.finishReason ?? null,
    usage: response?.usage ?? error?.opts.usage ?? UNKNOWN_USAGE,
    requestJson: JSON.stringify({ model: base.model, system: base.system, user: base.user, maxTokens: base.maxTokens }),
    responseText: response?.text ?? error?.opts.responseText ?? null,
  });
  deps.logger?.info(
    { jobId: meta.jobId, characterId: meta.characterId, purpose: base.purpose, attempt: meta.attempt, model: base.model, promptVersion: meta.promptVersion, latencyMs, errorCode: error?.code },
    'model call',
  );
  return response ? { kind: 'ok', response, callId } : { kind: 'error', error: error! };
}
