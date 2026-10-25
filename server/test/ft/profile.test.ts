import { randomUUID } from 'node:crypto';
import { characterDetailSchema, storyDetailSchema } from '@cl/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { totalSpentUsd } from '../../src/repos/jobs.js';
import { createTestApp, json, type TestApp } from '../helpers/app.js';
import { ScriptedProvider, scriptedProfile } from '../helpers/scripted-provider.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

const textCard = { format: 'text', name: '阿泽', description: '广州的自由写作者，毒舌但有趣，喜欢在骑楼下的糖水铺写稿。' };

async function setup(env: Record<string, string> = {}) {
  const provider = new ScriptedProvider();
  t = await createTestApp({ provider, sleep: vi.fn(async () => undefined), env });
  const settle = () => Promise.all([t!.app.profiles.idle(), t!.app.generation.idle()]);
  const detail = async (id: string) => characterDetailSchema.parse((await json(t!.app, 'GET', `/api/characters/${id}`)).body);
  return { app: t.app, db: t.db, provider, settle, detail };
}

describe('profile completion', () => {
  it('completes an imported card in the background, marking each field’s source', async () => {
    const c = await setup();
    c.provider.pushProfile({ kind: 'gate', then: { kind: 'text', text: JSON.stringify(scriptedProfile()) } });
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    expect((await c.detail(body.character.id)).profile.status).toBe('pending');
    c.provider.openGate();
    await c.settle();
    const { profile } = await c.detail(body.character.id);
    expect(profile.status).toBe('ready');
    expect(profile.profile!.fields[0]).toEqual({ key: 'name', value: '阿泽', source: 'original', reason: '' });
    expect(profile.profile!.fields.find((f) => f.key === 'occupation')).toMatchObject({ source: 'inferred' });
    expect(profile.profile!.fields.find((f) => f.key === 'economy')).toMatchObject({ source: 'imagined' });
    expect(c.provider.profileCalls[0]!.user).toContain('糖水铺');
    expect(c.db.prepare(`SELECT purpose, character_id, job_id FROM model_calls`).get()).toEqual({ purpose: 'profile', character_id: body.character.id, job_id: null });
  });

  it('retries once on a retryable error, then records the failure with its reason', async () => {
    const c = await setup();
    c.provider.pushProfile({ kind: 'error', code: 'MODEL_UNAVAILABLE' }, { kind: 'text', text: '不是 JSON' });
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    await c.settle();
    const { profile } = await c.detail(body.character.id);
    expect(profile).toMatchObject({ status: 'failed', profile: null, error: expect.stringContaining('格式不合格') });
    expect(c.provider.profileCalls).toHaveLength(2);
    expect(c.db.prepare(`SELECT outcome, error_message FROM model_calls ORDER BY attempt`).all()).toEqual([
      { outcome: 'error', error_message: 'scripted MODEL_UNAVAILABLE' },
      { outcome: 'invalid', error_message: '输出不是合法的 JSON' },
    ]);

    c.provider.pushProfile({ kind: 'gate', then: { kind: 'text', text: JSON.stringify(scriptedProfile()) } });
    const retry = await json(c.app, 'POST', `/api/characters/${body.character.id}/profile`);
    expect(retry.status).toBe(202);
    expect((await json(c.app, 'POST', `/api/characters/${body.character.id}/profile`)).status).toBe(409);
    c.provider.openGate();
    await c.settle();
    expect((await c.detail(body.character.id)).profile.status).toBe('ready');
  });

  it('keeps an earlier profile when a refresh fails', async () => {
    const c = await setup();
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    await c.settle();
    c.provider.pushProfile({ kind: 'error', code: 'MODEL_REFUSED' });
    await json(c.app, 'POST', `/api/characters/${body.character.id}/profile`);
    await c.settle();
    expect((await c.detail(body.character.id)).profile).toMatchObject({ status: 'ready', error: expect.stringContaining('拒绝') });
  });

  it('freezes the profile into the story with the first chapter and uses it in the prompt', async () => {
    const c = await setup();
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    await c.settle();
    const story = (await json<{ id: string }>(c.app, 'POST', `/api/characters/${body.character.id}/stories`, {})).body;
    expect(storyDetailSchema.parse((await json(c.app, 'GET', `/api/stories/${story.id}`)).body)).toMatchObject({ profileFrozen: false, profile: { status: 'ready' } });
    await json(c.app, 'POST', `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
    await c.settle();
    expect(c.provider.calls[0]!.user).toContain('- 经济状态[想象]：手头紧，靠接单维持');

    // A later profile refresh does not change a story that already started.
    c.provider.pushProfile({ kind: 'text', text: JSON.stringify({ fields: ['age', 'gender', 'language', 'occupation', 'economy', 'relationship', 'residence', 'appearance'].map((key) => ({ key, value: '新版本', source: 'imagined', reason: '' })) }) });
    await json(c.app, 'POST', `/api/characters/${body.character.id}/profile`);
    await c.settle();
    const after = storyDetailSchema.parse((await json(c.app, 'GET', `/api/stories/${story.id}`)).body);
    expect(after.profileFrozen).toBe(true);
    expect(after.profile.profile!.fields.find((f) => f.key === 'economy')!.value).toBe('手头紧，靠接单维持');
    await json(c.app, 'POST', `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
    await c.settle();
    expect(c.provider.calls[1]!.user).not.toContain('新版本');
  });

  it('fails a profile left pending by a previous process', async () => {
    const c = await setup();
    c.db.prepare(`UPDATE characters SET profile_status = 'pending' WHERE id = 'lin-wan'`).run();
    c.app.profiles.recoverInterrupted();
    expect((await c.detail('lin-wan')).profile).toMatchObject({ error: expect.stringContaining('服务重启') });
  });

  it('respects the budget cap', async () => {
    const c = await setup({ BUDGET_USD_CAP: '0.0001' });
    c.db.prepare(`INSERT INTO model_calls (id, purpose, attempt, model, prompt_version, started_at, outcome, cost_usd, cost_source, request_json) VALUES ('x', 'chapter', 1, 'm', 'v', 't', 'ok', 1, 'reported', '{}')`).run();
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    await c.settle();
    expect((await c.detail(body.character.id)).profile).toMatchObject({ status: 'failed', error: expect.stringContaining('费用上限') });
    expect(c.provider.profileCalls).toHaveLength(0);
  });

  it('keeps spend history after deleting a character', async () => {
    const c = await setup();
    const { body } = await json<{ character: { id: string } }>(c.app, 'POST', '/api/characters/import', textCard);
    await c.settle();
    const story = (await json<{ id: string }>(c.app, 'POST', `/api/characters/${body.character.id}/stories`, {})).body;
    await json(c.app, 'POST', `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
    await c.settle();
    const before = totalSpentUsd(c.db);
    expect(before).toBeGreaterThan(0);
    expect((await json(c.app, 'DELETE', `/api/characters/${body.character.id}`)).status).toBe(204);
    expect(totalSpentUsd(c.db)).toBe(before);
  });
});
