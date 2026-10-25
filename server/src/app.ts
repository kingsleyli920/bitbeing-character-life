import fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { HealthResponse, MetaResponse } from '@cl/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';

export interface BuildAppOptions {
  config: AppConfig;
  logger?: boolean;
}

export async function buildApp({ config, logger = false }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger && {
      level: 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 64 * 1024,
  });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true }));

  app.get(
    '/api/meta',
    async (): Promise<MetaResponse> => ({
      provider: config.provider,
      model: config.provider === 'fixture' ? 'fixture' : config.storyModel,
      modelConfigured: config.provider === 'fixture' || Boolean(config.openrouterApiKey),
    }),
  );

  // `npm start` serves the built web app from the same port; in dev, Vite proxies /api instead.
  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: '接口不存在' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
