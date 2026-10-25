import fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { HealthResponse, MetaResponse } from '@cl/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { clearAll, type Db, openDb } from './db/open.js';
import type { AppDeps } from './deps.js';
import { registerErrorHandler } from './http-errors.js';
import { seedPresets } from './presets/index.js';
import { totalSpentUsd } from './repos/jobs.js';
import { characterRoutes } from './routes/characters.js';
import { storyRoutes } from './routes/stories.js';

export interface BuildAppOptions {
  config: AppConfig;
  /** Defaults to opening `config.dbPath`. */
  db?: Db;
  now?: () => string;
  logger?: boolean;
}

export async function buildApp({ config, db: givenDb, now = () => new Date().toISOString(), logger = false }: BuildAppOptions): Promise<FastifyInstance> {
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
  if (!givenDb) app.addHook('onClose', async () => db.close());

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

  characterRoutes(app, deps);
  storyRoutes(app, deps);

  if (config.appEnv === 'test') {
    app.post('/api/__test__/reset', async (_req, reply) => {
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

