import type { MetaResponse } from '@cl/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const fixtureMeta: MetaResponse = {
  provider: 'fixture',
  model: 'fixture',
  modelConfigured: true,
  budget: { capUsd: 5, spentUsd: 0 },
};

export const server = setupServer(http.get('/api/meta', () => HttpResponse.json(fixtureMeta)));
