import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer } from '../../server/test/helpers/server-process.js';
import { createApiClient } from '../../web/src/api/client.js';

describe('contract: web api client ↔ real server', () => {
  let server: ServerProcess;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server?.stop();
  });

  it('GET /api/meta matches the shared schema', async () => {
    const api = createApiClient(server.baseUrl);
    await expect(api.getMeta()).resolves.toMatchObject({ provider: 'fixture' });
  });
});
