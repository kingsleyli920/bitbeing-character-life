import { metaResponseSchema } from '@cl/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

describe('app shell', () => {
  it('answers health checks', async () => {
    const app = await buildApp({ config: loadConfig({ DB_PATH: ':memory:' }, []) });
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('reports the model provider without leaking the key', async () => {
    const app = await buildApp({
      config: loadConfig({ DB_PATH: ':memory:', OPENROUTER_API_KEY: 'sk-or-v1-secret' }, []),
    });
    const res = await app.inject('/api/meta');
    expect(metaResponseSchema.parse(res.json())).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-5.5',
      modelConfigured: true,
    });
    expect(res.body).not.toContain('secret');
  });

  it('marks fixture mode explicitly', async () => {
    const app = await buildApp({ config: loadConfig({ DB_PATH: ':memory:' }, ['--provider=fixture']) });
    expect((await app.inject('/api/meta')).json()).toMatchObject({ provider: 'fixture', model: 'fixture' });
  });
});
