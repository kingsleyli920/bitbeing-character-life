import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer } from '../helpers/server-process.js';

describe('server process', () => {
  let server: ServerProcess;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server?.stop();
  });

  it('serves health and meta over HTTP', async () => {
    expect(await (await fetch(`${server.baseUrl}/api/health`)).json()).toEqual({ ok: true });
    const meta = await (await fetch(`${server.baseUrl}/api/meta`)).json();
    expect(meta).toMatchObject({ provider: 'fixture' });
  });
});
