import { randomUUID } from 'node:crypto';
import {
  chaptersResponseSchema,
  type Job,
  jobResponseSchema,
  memoryResponseSchema,
  storyDetailSchema,
  tocResponseSchema,
} from '@cl/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { countModelCalls } from '../../src/repos/model-calls.js';
import { createTestApp, json, type TestApp } from '../helpers/app.js';
import { ScriptedProvider } from '../helpers/scripted-provider.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

async function setup(env: Record<string, string> = {}) {
  const provider = new ScriptedProvider();
  const sleep = vi.fn(async (_ms: number) => undefined);
  t = await createTestApp({ provider, sleep, env });
  const story = (await json<{ id: string }>(t.app, 'POST', '/api/characters/zhou-ye/stories', {})).body;
  return { app: t.app, db: t.db, provider, sleep, storyId: story.id };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function postJob(c: Ctx, requestId = randomUUID(), storyId = c.storyId) {
  const res = await json<{ job: Job; code?: string }>(c.app, 'POST', `/api/stories/${storyId}/jobs`, { requestId });
  return { ...res, requestId };
}

async function getJob(c: Ctx, jobId: string): Promise<Job> {
  return jobResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}/jobs/${jobId}`)).body).job;
}

async function story(c: Ctx) {
  return storyDetailSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}`)).body);
}

async function chapters(c: Ctx, query = '') {
  return chaptersResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}/chapters${query}`)).body);
}

const idle = (c: Ctx) => c.app.generation.idle();

describe('generation happy path', () => {
  it('writes chapter 1, state, memory, usage and context stats', async () => {
    const c = await setup();
    const res = await postJob(c);
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ targetChapter: 1, promptVersion: 'chapter-v2' });
    expect(['queued', 'running']).toContain(res.body.job.status);
    await idle(c);

    const job = await getJob(c, res.body.job.id);
    expect(job).toMatchObject({ status: 'succeeded', attempts: 1, errorCode: null });
    expect(job.usage).toMatchObject({ inputTokens: 1000, outputTokens: 500, costUsd: 0.001, costSource: 'reported' });
    const s = await story(c);
    expect(s).toMatchObject({ chapterCount: 1, version: 1, activeJob: null, lastJob: { id: job.id } });
    expect(s.state?.situation).toBe('主唱退出，专场面临取消');
    expect((await chapters(c)).chapters.map((ch) => ch.title)).toEqual(['第1章的标题']);
    const memory = memoryResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}/memory`)).body);
    expect(memory.items.map((m) => m.key).sort()).toEqual(['报主唱名字', '老曾']);

    const stats = JSON.parse(
      (c.db.prepare('SELECT context_stats FROM jobs WHERE id = ?').get(job.id) as { context_stats: string }).context_stats,
    );
    expect(stats.totalTokens).toBeLessThanOrEqual(stats.budgetTokens);
    expect(c.provider.calls[0]!.user).toContain('请写第 1 章（开场章）');
  });

  it('feeds the previous chapter and memories into the next prompt', async () => {
    const c = await setup();
    await postJob(c);
    await idle(c);
    await postJob(c);
    await idle(c);
    const prompt = c.provider.calls[1]!.user;
    expect(prompt).toContain('【上一章原文】');
    expect(prompt).toContain('报主唱名字');
    expect(prompt).toContain('请写第 2 章');
  });
});

describe('job idempotency and locking', () => {
  it('T1: the same requestId returns the same job and writes at most one chapter', async () => {
    const c = await setup();
    const first = await postJob(c);
    const again = await postJob(c, first.requestId);
    expect(again.status).toBe(200);
    expect(again.body.job.id).toBe(first.body.job.id);
    await idle(c);
    const late = await postJob(c, first.requestId);
    expect(late.status).toBe(200);
    expect(late.body.job).toMatchObject({ id: first.body.job.id, status: 'succeeded' });
    await idle(c);
    expect((await chapters(c)).total).toBe(1);
    expect(c.provider.calls).toHaveLength(1);
  });

  it('T1: concurrent duplicate requests create one job', async () => {
    const c = await setup();
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => postJob(c, requestId)));
    expect(new Set(results.map((r) => r.body.job.id)).size).toBe(1);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    await idle(c);
    expect((await chapters(c)).total).toBe(1);
  });

  it('T2: a second request while a job is active gets 409 with the active job', async () => {
    const c = await setup();
    c.provider.push({ kind: 'hang' });
    const first = await postJob(c);
    await c.provider.waitForCalls(1);
    const second = await postJob(c);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'JOB_IN_PROGRESS', job: { id: first.body.job.id, status: 'running' } });
  });

  it('T2: different stories generate independently', async () => {
    const c = await setup();
    const other = (await json<{ id: string }>(c.app, 'POST', '/api/characters/lin-wan/stories', {})).body.id;
    const a = await postJob(c);
    const b = await postJob(c, randomUUID(), other);
    expect([a.status, b.status]).toEqual([202, 202]);
    await idle(c);
    expect((await chapters(c)).total).toBe(1);
  });
});

describe('stale and late results (T3)', () => {
  it('discards a late reply for a job that is no longer running', async () => {
    const c = await setup();
    c.provider.push({ kind: 'gate', then: { kind: 'draft', draft: { title: '迟到的结果' } } });
    const first = await postJob(c);
    await c.provider.waitForCalls(1);
    // Another process marks the job interrupted and a newer job writes chapter 1.
    c.db.prepare(`UPDATE jobs SET status = 'interrupted', error_code = 'SERVER_RESTART' WHERE id = ?`).run(first.body.job.id);
    const second = await postJob(c);
    await c.provider.waitForCalls(2);
    c.provider.openGate();
    await idle(c);

    expect((await getJob(c, first.body.job.id)).status).toBe('interrupted');
    expect((await getJob(c, second.body.job.id)).status).toBe('succeeded');
    const list = await chapters(c);
    expect(list.chapters.map((ch) => ch.title)).toEqual(['第1章的标题']);
    expect(
      c.db.prepare(`SELECT outcome FROM model_calls WHERE job_id = ?`).get(first.body.job.id),
    ).toMatchObject({ outcome: 'discarded' });
  });

  it('marks a job stale when the story moved on while it was running', async () => {
    const c = await setup();
    c.provider.push({ kind: 'gate', then: { kind: 'draft' } });
    const res = await postJob(c);
    await c.provider.waitForCalls(1);
    c.db.prepare('UPDATE stories SET version = version + 1 WHERE id = ?').run(c.storyId);
    c.provider.openGate();
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'stale', errorCode: 'STALE' });
    expect((await chapters(c)).total).toBe(0);
  });
});

describe('isolation (T4)', () => {
  it('404s a job requested through another story', async () => {
    const c = await setup();
    const other = (await json<{ id: string }>(c.app, 'POST', '/api/characters/lin-wan/stories', {})).body.id;
    const res = await postJob(c);
    await idle(c);
    expect((await json(c.app, 'GET', `/api/stories/${other}/jobs/${res.body.job.id}`)).status).toBe(404);
    const otherChapters = chaptersResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${other}/chapters`)).body);
    expect(otherChapters.total).toBe(0);
  });

  it('404s jobs and chapters of an unknown story', async () => {
    const c = await setup();
    expect((await postJob(c, randomUUID(), 'nope')).status).toBe(404);
    expect((await json(c.app, 'GET', '/api/stories/nope/chapters')).status).toBe(404);
  });
});

describe('retries (T5)', () => {
  it.each([
    ['MODEL_UNAVAILABLE', 2000],
    ['MODEL_TIMEOUT', 2000],
    ['MODEL_TRUNCATED', 2000],
  ] as const)('retries %s with backoff', async (code, wait) => {
    const c = await setup();
    c.provider.push({ kind: 'error', code });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(c.sleep).toHaveBeenCalledWith(wait);
  });

  it('honours Retry-After on 429', async () => {
    const c = await setup();
    c.provider.push({ kind: 'error', code: 'MODEL_RATE_LIMITED', retryAfterMs: 7000 });
    await postJob(c);
    await idle(c);
    expect(c.sleep).toHaveBeenCalledWith(7000);
  });

  it('caps Retry-After at 20 seconds', async () => {
    const c = await setup();
    c.provider.push({ kind: 'error', code: 'MODEL_RATE_LIMITED', retryAfterMs: 600_000 });
    await postJob(c);
    await idle(c);
    expect(c.sleep).toHaveBeenCalledWith(20_000);
  });

  it('retries invalid output and records the invalid call', async () => {
    const c = await setup();
    c.provider.push({ kind: 'text', text: '好的，下面是第一章：' });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(c.db.prepare(`SELECT outcome FROM model_calls WHERE job_id = ? ORDER BY attempt`).all(res.body.job.id)).toEqual([
      { outcome: 'invalid' },
      { outcome: 'ok' },
    ]);
  });

  it('gives up after 3 attempts with the last error and no chapter', async () => {
    const c = await setup();
    c.provider.push({ kind: 'error', code: 'MODEL_UNAVAILABLE' }, { kind: 'text', text: '{}' }, { kind: 'error', code: 'MODEL_RATE_LIMITED' });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', attempts: 3, errorCode: 'MODEL_RATE_LIMITED' });
    expect(c.provider.calls).toHaveLength(3);
    expect(await story(c)).toMatchObject({ chapterCount: 0, version: 0, state: null });
  });

  it.each(['MODEL_REFUSED', 'MODEL_AUTH', 'INTERNAL'] as const)('does not retry %s', async (code) => {
    const c = await setup();
    c.provider.push({ kind: 'error', code });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', attempts: 1, errorCode: code });
    expect(c.provider.calls).toHaveLength(1);
  });

  it('times out a hanging call and stops at the attempt limit', async () => {
    const c = await setup({ MODEL_ATTEMPT_TIMEOUT_MS: '30', JOB_DEADLINE_MS: '10000' });
    c.provider.push({ kind: 'hang' }, { kind: 'hang' }, { kind: 'hang' });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', attempts: 3, errorCode: 'MODEL_TIMEOUT' });
  });

  it('stops retrying when the job deadline is near', async () => {
    const c = await setup({ MODEL_ATTEMPT_TIMEOUT_MS: '100', JOB_DEADLINE_MS: '120' });
    c.provider.push({ kind: 'hang' }, { kind: 'hang' });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', attempts: 1, errorCode: 'MODEL_TIMEOUT' });
  });

  it('fails fast without a model key', async () => {
    const c = await setup();
    c.provider.configured = false;
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', errorCode: 'MODEL_NOT_CONFIGURED' });
    expect(c.provider.calls).toHaveLength(0);
  });
});

describe('restart recovery (T6)', () => {
  it('marks a job left running by a previous process as interrupted and does not call the model', async () => {
    const c = await setup();
    c.provider.push({ kind: 'hang' });
    const res = await postJob(c);
    await c.provider.waitForCalls(1);

    const provider2 = new ScriptedProvider();
    const config = loadConfig({ APP_ENV: 'test', DB_PATH: ':memory:' }, ['--provider=fixture']);
    const restarted = await buildApp({ config, db: c.db, provider: provider2 });
    const job = jobResponseSchema.parse(
      (await json(restarted, 'GET', `/api/stories/${c.storyId}/jobs/${res.body.job.id}`)).body,
    ).job;
    expect(job).toMatchObject({ status: 'interrupted', errorCode: 'SERVER_RESTART' });
    expect(provider2.calls).toHaveLength(0);
    await restarted.close();
  });
});

describe('directions (T7)', () => {
  it('sets, replaces and clears the direction without bumping the story version', async () => {
    const c = await setup();
    const set = await json<{ direction: { text: string; effectiveFromChapter: number } }>(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '  接下来温暖一点  ' });
    expect(set.status).toBe(200);
    expect(set.body.direction).toMatchObject({ text: '接下来温暖一点', effectiveFromChapter: 1 });
    await json(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '让失联的朋友重新出现' });
    expect((await story(c)).direction?.text).toBe('让失联的朋友重新出现');
    expect((await json(c.app, 'DELETE', `/api/stories/${c.storyId}/direction`)).status).toBe(204);
    expect(await story(c)).toMatchObject({ direction: null, version: 0 });
  });

  it.each([['一'], ['长'.repeat(201)], ['   ']])('rejects direction %#', async (text) => {
    const c = await setup();
    const res = await json(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION' });
  });

  it('uses the direction locked at job creation; a change mid-job applies to the next chapter', async () => {
    const c = await setup();
    await json(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '走向A：让他遇到事业挫折' });
    c.provider.push({ kind: 'gate', then: { kind: 'draft' } });
    await postJob(c);
    await c.provider.waitForCalls(1);
    const b = await json<{ direction: { effectiveFromChapter: number } }>(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '走向B：接下来温暖一点' });
    expect(b.body.direction.effectiveFromChapter).toBe(2);
    c.provider.openGate();
    await idle(c);
    await postJob(c);
    await idle(c);

    const list = await chapters(c);
    expect(list.chapters.map((ch) => ch.direction?.text)).toEqual(['走向A：让他遇到事业挫折', '走向B：接下来温暖一点']);
    expect(list.chapters[0]!.directionHandling?.how).toContain('走向A');
    expect(c.provider.calls[0]!.user).toContain('走向A');
    expect(c.provider.calls[1]!.user).toContain('走向B');
    expect(c.provider.calls[1]!.user).toContain('从本章开始生效');
  });

  it('rejects a draft that ignores an active direction', async () => {
    const c = await setup();
    await json(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '让他和父亲和解' });
    c.provider.push({ kind: 'draft', draft: { directionHandling: null } });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'succeeded', attempts: 2 });
  });
});

describe('atomic commit (T8)', () => {
  it('rolls back the chapter and memory when a later write fails', async () => {
    const c = await setup();
    c.db.exec(`CREATE TRIGGER fail_traits BEFORE INSERT ON trait_changes BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    c.provider.push({
      kind: 'draft',
      draft: { traitChanges: [{ trait: '胆量', from: '怯', to: '敢', causeChapters: [1], explanation: '被逼到墙角' }] },
    });
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', errorCode: 'INTERNAL' });
    expect(await story(c)).toMatchObject({ chapterCount: 0, version: 0, state: null });
    expect(memoryResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}/memory`)).body).items).toEqual([]);
    expect((await chapters(c)).total).toBe(0);
    // The story is still usable afterwards.
    c.db.exec('DROP TRIGGER fail_traits');
    await postJob(c);
    await idle(c);
    expect((await chapters(c)).total).toBe(1);
  });
});

describe('budget cap (T10)', () => {
  it('stops calling the model once the cap is reached', async () => {
    const c = await setup({ BUDGET_USD_CAP: '0.01' });
    c.provider.push({ kind: 'draft', costUsd: 0.02 });
    await postJob(c);
    await idle(c);
    const res = await postJob(c);
    await idle(c);
    expect(await getJob(c, res.body.job.id)).toMatchObject({ status: 'failed', errorCode: 'BUDGET_EXCEEDED' });
    expect(c.provider.calls).toHaveLength(1);
    expect(countModelCalls(c.db, c.storyId)).toBe(1);
    expect((await json(c.app, 'GET', '/api/meta')).body).toMatchObject({ budget: { capUsd: 0.01, spentUsd: 0.02 } });
  });
});

describe('reading endpoints', () => {
  it('pages chapters, lists the table of contents and records warnings', async () => {
    const c = await setup();
    c.provider.push(
      { kind: 'draft' },
      { kind: 'draft' },
      { kind: 'draft', draft: { memoryOps: [{ op: 'resolve', kind: 'thread', key: '不存在的线索', content: '解决', importance: 1, status: 'resolved' }] } },
    );
    let lastJob = '';
    for (let i = 0; i < 3; i++) {
      lastJob = (await postJob(c)).body.job.id;
      await idle(c);
    }
    expect((await chapters(c, '?limit=2')).chapters.map((ch) => ch.number)).toEqual([2, 3]);
    expect((await chapters(c, '?from=1&limit=2')).chapters.map((ch) => ch.number)).toEqual([1, 2]);
    expect((await json(c.app, 'GET', `/api/stories/${c.storyId}/chapters?limit=21`)).status).toBe(400);
    const toc = tocResponseSchema.parse((await json(c.app, 'GET', `/api/stories/${c.storyId}/toc`)).body);
    expect(toc.items.map((i) => i.number)).toEqual([1, 2, 3]);
    expect((await getJob(c, lastJob)).warnings[0]).toContain('不存在的线索');
  });
});

describe('export', () => {
  it('downloads every chapter as Markdown with the direction notes', async () => {
    const c = await setup();
    await json(c.app, 'PUT', `/api/stories/${c.storyId}/direction`, { text: '接下来温暖一点' });
    for (let i = 0; i < 2; i++) {
      await postJob(c);
      await idle(c);
    }
    const res = await c.app.inject(`/api/stories/${c.storyId}/export.md`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('周野的故事.md'));
    expect(res.body).toMatch(/^# 周野的故事/);
    expect(res.body).toContain('## 第1章 第1章的标题');
    expect(res.body).toContain('## 第2章 第2章的标题');
    expect(res.body).toContain('> 本章走向：接下来温暖一点');
    expect((await c.app.inject('/api/stories/nope/export.md')).statusCode).toBe(404);
  });
});
