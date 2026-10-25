import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })),
  );
}

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns parsed data on success', async () => {
    const meta = { provider: 'fixture', model: 'fixture', modelConfigured: true, budget: { capUsd: 5, spentUsd: 0 } };
    mockFetch(200, meta);
    await expect(createApiClient().getMeta()).resolves.toEqual(meta);
  });

  it('rejects a response that breaks the shared schema', async () => {
    mockFetch(200, { provider: 'gpt' });
    await expect(createApiClient().getMeta()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('surfaces the server error code and message', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: '找不到' });
    const err = await createApiClient().getMeta().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: '找不到' });
  });

  it('maps a failed fetch to a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('failed'))));
    await expect(createApiClient().getMeta()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
