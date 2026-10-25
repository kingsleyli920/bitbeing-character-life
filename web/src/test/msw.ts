import type { MetaResponse } from '@cl/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const fixtureMeta: MetaResponse = { provider: 'fixture', model: 'fixture', modelConfigured: true };

export const server = setupServer(http.get('/api/meta', () => HttpResponse.json(fixtureMeta)));
