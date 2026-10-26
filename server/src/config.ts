import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export type AppEnv = 'development' | 'test' | 'eval';
export type ModelProviderName = 'openrouter' | 'fixture';

export interface AppConfig {
  appEnv: AppEnv;
  port: number;
  host: string;
  dbPath: string;
  provider: ModelProviderName;
  openrouterApiKey: string | undefined;
  storyModel: string;
  budgetUsdCap: number;
  contextBudgetTokens: number;
  attemptTimeoutMs: number;
  jobDeadlineMs: number;
  maxAttempts: number;
  jobConcurrency: number;
  fixtureDelayMs: number;
  /** Review each draft for contradictions with earlier chapters before saving it (SPEC §2.7). */
  consistencyCheck: boolean;
  webDistDir: string;
}

const int = (min: number) => z.coerce.number().int().min(min);

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'eval']).default('development'),
  PORT: int(1).max(65535).default(3210),
  HOST: z.string().min(1).default('127.0.0.1'),
  DB_PATH: z.string().min(1).default('data/dev.db'),
  MODEL_PROVIDER: z.enum(['openrouter', 'fixture']).default('openrouter'),
  OPENROUTER_API_KEY: z.string().optional(),
  STORY_MODEL: z.string().min(1).default('anthropic/claude-haiku-5.5'),
  BUDGET_USD_CAP: z.coerce.number().positive().default(5),
  CONTEXT_BUDGET_TOKENS: int(2000).default(12000),
  MODEL_ATTEMPT_TIMEOUT_MS: int(1).default(90_000),
  JOB_DEADLINE_MS: int(1).default(180_000),
  MODEL_MAX_ATTEMPTS: int(1).max(5).default(3),
  JOB_CONCURRENCY: int(1).max(8).default(2),
  FIXTURE_DELAY_MS: int(0).default(0),
  CONSISTENCY_CHECK: z.enum(['on', 'off']).default('on'),
});

function readArg(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function resolveFromRoot(p: string): string {
  return p === ':memory:' || path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

/** Reads configuration from env vars (plus `--provider=` on the command line). Throws a readable error naming the bad variable. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  argv: readonly string[] = process.argv.slice(2),
): AppConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const providerArg = readArg(argv, 'provider');
  if (providerArg) cleaned.MODEL_PROVIDER = providerArg;

  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`配置无效（检查环境变量或 .env.local）：${details}`);
  }
  const e = parsed.data;
  return {
    appEnv: e.APP_ENV,
    port: e.PORT,
    host: e.HOST,
    dbPath: resolveFromRoot(e.DB_PATH),
    provider: e.MODEL_PROVIDER,
    openrouterApiKey: e.OPENROUTER_API_KEY?.trim() || undefined,
    storyModel: e.STORY_MODEL,
    budgetUsdCap: e.BUDGET_USD_CAP,
    contextBudgetTokens: e.CONTEXT_BUDGET_TOKENS,
    attemptTimeoutMs: e.MODEL_ATTEMPT_TIMEOUT_MS,
    jobDeadlineMs: e.JOB_DEADLINE_MS,
    maxAttempts: e.MODEL_MAX_ATTEMPTS,
    jobConcurrency: e.JOB_CONCURRENCY,
    fixtureDelayMs: e.FIXTURE_DELAY_MS,
    consistencyCheck: e.CONSISTENCY_CHECK === 'on',
    webDistDir: path.join(REPO_ROOT, 'web/dist'),
  };
}

/** Loads `.env.local` from the repo root if it exists. Real environment variables win. */
export function loadEnvFile(): void {
  const file = path.join(REPO_ROOT, '.env.local');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
