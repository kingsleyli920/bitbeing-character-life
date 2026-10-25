import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, REPO_ROOT } from '../../src/config.js';

describe('loadConfig', () => {
  it('uses development defaults when nothing is set', () => {
    const config = loadConfig({}, []);
    expect(config).toMatchObject({
      appEnv: 'development',
      port: 3210,
      provider: 'openrouter',
      storyModel: 'anthropic/claude-haiku-5.5',
      budgetUsdCap: 5,
      contextBudgetTokens: 12000,
      attemptTimeoutMs: 90_000,
      jobDeadlineMs: 180_000,
      maxAttempts: 3,
      jobConcurrency: 2,
    });
    expect(config.dbPath).toBe(path.join(REPO_ROOT, 'data/dev.db'));
    expect(config.openrouterApiKey).toBeUndefined();
  });

  it('resolves a relative DB_PATH against the repo root and keeps :memory:', () => {
    expect(loadConfig({ DB_PATH: 'test-results/x.db' }, []).dbPath).toBe(
      path.join(REPO_ROOT, 'test-results/x.db'),
    );
    expect(loadConfig({ DB_PATH: ':memory:' }, []).dbPath).toBe(':memory:');
  });

  it('lets --provider=fixture override MODEL_PROVIDER', () => {
    expect(loadConfig({ MODEL_PROVIDER: 'openrouter' }, ['--provider=fixture']).provider).toBe(
      'fixture',
    );
  });

  it('treats an empty API key as missing', () => {
    expect(loadConfig({ OPENROUTER_API_KEY: '  ' }, []).openrouterApiKey).toBeUndefined();
  });

  it('names the variable when a value is invalid', () => {
    expect(() => loadConfig({ PORT: 'abc' }, [])).toThrow(/PORT/);
    expect(() => loadConfig({ MODEL_PROVIDER: 'gpt' }, [])).toThrow(/MODEL_PROVIDER/);
    expect(() => loadConfig({ BUDGET_USD_CAP: '-1' }, [])).toThrow(/BUDGET_USD_CAP/);
  });
});
