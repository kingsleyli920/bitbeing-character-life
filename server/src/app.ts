import fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { HealthResponse, MetaResponse } from '@cl/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { clearAll, type Db, openDb } from './db/open.js';
import type { AppDeps } from './deps.js';
import { registerErrorHandler } from './http-errors.js';
import { seedPresets } from './presets/index.js';
import { createFixtureProvider } from './model/fixture.js';
import { createOpenRouterProvider } from './model/openrouter.js';
import { MODEL_PRICING } from './model/pricing.js';
import type { ModelProvider } from './model/provider.js';
import { totalSpentUsd } from './repos/jobs.js';
import { characterRoutes } from './routes/characters.js';
import { storyRoutes } from './routes/stories.js';
import { GenerationService } from './services/generation.js';
import { ProfileService } from './services/profile.js';

export interface BuildAppOptions {
  config: AppConfig;
  /** Defaults to opening `config.dbPath`. */
  db?: Db;
  now?: () => string;
  logger?: boolean;
  /** Defaults to the provider named by `config.provider`. */
  provider?: ModelProvider;
  /** Retry backoff wait; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

export function providerFromConfig(config: AppConfig): ModelProvider {
  return config.provider === 'fixture'
    ? createFixtureProvider({ delayMs: config.fixtureDelayMs })
    : createOpenRouterProvider({ apiKey: config.openrouterApiKey, pricing: MODEL_PRICING, reasoningEffort: 'low' });
}

export async function buildApp({
  config,
  db: givenDb,
  now = () => new Date().toISOString(),
  logger = false,
  provider = providerFromConfig(config),
  sleep,
}: BuildAppOptions): Promise<FastifyInstance> {
  const db = givenDb ?? openDb(config.dbPath);
  seedPresets(db, now());
  const deps: AppDeps = { config, db, now };

  const app = Fastify({
    logger: logger && {
      level: 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 64 * 1024,
  });
  registerErrorHandler(app);
  const generation = new GenerationService({ ...deps, provider, logger: app.log, ...(sleep && { sleep }) });
  generation.recoverInterrupted();
  const profiles = new ProfileService({ ...deps, provider, logger: app.log, ...(sleep && { sleep }) });
  profiles.recoverInterrupted();
  app.decorate('generation', generation);
  app.decorate('profiles', profiles);
  app.addHook('onClose', async () => {
    await Promise.all([generation.shutdown(), profiles.shutdown()]);
    if (!givenDb) db.close();
  });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true }));

  app.get(
    '/api/meta',
    async (): Promise<MetaResponse> => ({
      provider: config.provider,
      model: config.provider === 'fixture' ? 'fixture' : config.storyModel,
      modelConfigured: config.provider === 'fixture' || Boolean(config.openrouterApiKey),
      budget: { capUsd: config.budgetUsdCap, spentUsd: totalSpentUsd(db) },
    }),
  );

  characterRoutes(app, deps, profiles);
  storyRoutes(app, deps, generation);

  if (config.appEnv === 'test') {
    app.post('/api/__test__/reset', async (_req, reply) => {
      await Promise.all([generation.idle(), profiles.idle()]);
      clearAll(db);
      seedPresets(db, now());
      return reply.code(204).send();
    });
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !fs.existsSync(config.webDistDir)) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: '接口不存在' });
    }
    return reply.sendFile('index.html');
  });

  // `npm start` serves the built web app from the same port; in dev, Vite proxies /api instead.
  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
  }

  return app;
}


declare module 'fastify' {
  interface FastifyInstance {
    generation: GenerationService;
    profiles: ProfileService;
  }
}
