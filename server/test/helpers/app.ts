import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../../src/app.js';
import { type AppConfig, loadConfig } from '../../src/config.js';
import { type Db, openDb } from '../../src/db/open.js';

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  config: AppConfig;
}

/** A fresh app on its own in-memory database, with the fixture model unless overridden. */
export async function createTestApp(
  overrides: Partial<Omit<BuildAppOptions, 'config' | 'db'>> & { env?: Record<string, string> } = {},
): Promise<TestApp> {
  const { env, ...rest } = overrides;
  const config = loadConfig({ APP_ENV: 'test', DB_PATH: ':memory:', ...env }, ['--provider=fixture']);
  const db = openDb(':memory:');
  const app = await buildApp({ config, db, ...rest });
  return { app, db, config };
}

export async function json<T = unknown>(app: FastifyInstance, method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, ...(payload !== undefined && { payload: payload as object }) });
  return { status: res.statusCode, body: (res.body ? res.json() : undefined) as T, raw: res };
}
