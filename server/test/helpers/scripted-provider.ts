import type { ChapterDraft, JobErrorCode } from '@cl/shared';
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse } from '../../src/model/provider.js';
import { makeDraft } from './drafts.js';

export type Step =
  | { kind: 'draft'; draft?: Partial<ChapterDraft>; costUsd?: number }
  | { kind: 'text'; text: string }
  | { kind: 'error'; code: JobErrorCode; retryAfterMs?: number }
  /** Never settles on its own; rejects when the request is aborted. */
  | { kind: 'hang' }
  /** Waits for `gate()` to be released, ignoring aborts, then runs `then` (simulates a late reply). */
  | { kind: 'gate'; then: Step };

/** A fake model driven by a queue of steps. Default step: a valid draft. */
export class ScriptedProvider implements ModelProvider {
  readonly name = 'openrouter' as const;
  configured = true;
  readonly calls: ModelRequest[] = [];
  readonly arcCalls: ModelRequest[] = [];
  private readonly steps: Step[] = [];
  private readonly arcSteps: Step[] = [];
  /** Builds the default draft for a chapter when no step is queued. */
  draftFor: (req: ModelRequest) => Partial<ChapterDraft> = () => ({});
  private releaseGate: (() => void) | undefined;
  private gateOpened = new Promise<void>((r) => (this.releaseGate = r));
  private callWaiters: { count: number; resolve: () => void }[] = [];

  push(...steps: Step[]): this {
    this.steps.push(...steps);
    return this;
  }

  /** Steps for arc-summary calls (default: a valid summary). */
  pushArc(...steps: Step[]): this {
    this.arcSteps.push(...steps);
    return this;
  }

  /** Lets every pending and future `gate` step continue. */
  openGate(): void {
    this.releaseGate?.();
  }

  /** Resolves once `count` calls have started. */
  waitForCalls(count: number): Promise<void> {
    if (this.calls.length >= count) return Promise.resolve();
    return new Promise((resolve) => this.callWaiters.push({ count, resolve }));
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    if (req.purpose === 'arc_summary') {
      this.arcCalls.push(req);
      const step = this.arcSteps.shift() ?? { kind: 'text', text: JSON.stringify({ summary: `卷摘要：${'这一卷发生了很多事。'.repeat(5)}` }) };
      return this.run(step, req);
    }
    this.calls.push(req);
    for (const w of this.callWaiters.filter((w) => this.calls.length >= w.count)) w.resolve();
    return this.run(this.steps.shift() ?? { kind: 'draft' }, req);
  }

  private async run(step: Step, req: ModelRequest): Promise<ModelResponse> {
    switch (step.kind) {
      case 'draft': {
        const draft = makeDraft({
          title: `第${req.trace.chapterNumber}章的标题`,
          directionHandling: req.trace.directionText
            ? { applied: true, how: `按「${req.trace.directionText}」安排了冲突`, adjustments: null }
            : null,
          ...this.draftFor(req),
          ...step.draft,
        });
        return this.reply(JSON.stringify(draft), step.costUsd ?? 0.001);
      }
      case 'text':
        return this.reply(step.text, 0.001);
      case 'error':
        throw new ModelError(step.code, `scripted ${step.code}`, step.retryAfterMs ? { retryAfterMs: step.retryAfterMs } : {});
      case 'hang':
        return new Promise((_, reject) =>
          req.signal.addEventListener('abort', () => reject(new ModelError('MODEL_TIMEOUT', 'aborted'))),
        );
      case 'gate':
        await this.gateOpened;
        return this.run(step.then, req);
    }
  }

  private reply(text: string, costUsd: number): ModelResponse {
    return {
      text,
      finishReason: 'stop',
      provider: 'scripted',
      usage: { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0, costUsd, costSource: 'reported' },
    };
  }
}
