import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenRouterProvider } from '../../src/model/openrouter.js';
import type { ModelRequest } from '../../src/model/provider.js';

const request = (signal = new AbortController().signal): ModelRequest => ({
  purpose: 'chapter',
  model: 'anthropic/claude-haiku-5.5',
  system: 'sys',
  user: 'user',
  schemaName: 'chapter',
  jsonSchema: { type: 'object' },
  maxTokens: 100,
  signal,
  trace: { storyId: 's', chapterNumber: 1, characterName: '林晚', directionText: null, knownKeys: [] },
});

const ok = (over: Record<string, unknown> = {}) => ({
  provider: 'Anthropic',
  choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 10 }, cost: 0.001 },
  ...over,
});

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('openrouter provider', () => {
  afterEach(() => vi.unstubAllGlobals());
  const provider = createOpenRouterProvider({ apiKey: 'sk-test', pricing: {} });

  it('sends a strict json_schema request and reads text, provider and usage', async () => {
    const fetchMock = stubFetch(200, ok());
    const res = await provider.complete(request());
    expect(res).toEqual({
      text: '{"a":1}',
      finishReason: 'stop',
      provider: 'Anthropic',
      usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 10, costUsd: 0.001, costSource: 'reported' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      model: 'anthropic/claude-haiku-5.5',
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'user' },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'chapter', strict: true, schema: { type: 'object' } } },
      provider: { require_parameters: true },
      usage: { include: true },
    });
    expect(JSON.stringify(body)).not.toContain('trace');
  });

  it('estimates cost from the pricing table when the provider omits it', async () => {
    stubFetch(200, ok({ usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } }));
    const priced = createOpenRouterProvider({
      apiKey: 'k',
      pricing: { 'anthropic/claude-haiku-5.5': { inputPerMTok: 0.1, outputPerMTok: 0.5 } },
    });
    expect((await priced.complete(request())).usage).toMatchObject({ costUsd: 0.6, costSource: 'estimated' });
    expect((await provider.complete(request())).usage).toMatchObject({ costUsd: null, costSource: 'unknown' });
  });

  it.each([
    [429, {}, { 'retry-after': '7' }, 'MODEL_RATE_LIMITED', 7000],
    [401, {}, {}, 'MODEL_AUTH', undefined],
    [402, {}, {}, 'MODEL_AUTH', undefined],
    [403, { error: { message: 'flagged by moderation' } }, {}, 'MODEL_REFUSED', undefined],
    [500, {}, {}, 'MODEL_UNAVAILABLE', undefined],
    [503, {}, {}, 'MODEL_UNAVAILABLE', undefined],
    [400, { error: { message: 'bad schema' } }, {}, 'INTERNAL', undefined],
  ] as const)('maps HTTP %i to %s', async (status, body, headers, code, retryAfterMs) => {
    stubFetch(status, body, headers);
    const err = await provider.complete(request()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code });
    if (retryAfterMs) expect(err).toMatchObject({ opts: { retryAfterMs } });
  });

  it.each([
    ['length', 'MODEL_TRUNCATED'],
    ['content_filter', 'MODEL_REFUSED'],
  ])('maps finish_reason %s to %s and keeps usage', async (reason, code) => {
    stubFetch(200, ok({ choices: [{ finish_reason: reason, message: { content: '{"a"' } }] }));
    const err = await provider.complete(request()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code, opts: { usage: { costUsd: 0.001 } } });
  });

  it('maps an error object inside a 200 body', async () => {
    stubFetch(200, { error: { code: 502, message: 'upstream died' } });
    await expect(provider.complete(request())).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });

  it('maps an empty completion to invalid output', async () => {
    stubFetch(200, ok({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }));
    await expect(provider.complete(request())).rejects.toMatchObject({ code: 'MODEL_INVALID_OUTPUT' });
  });

  it('maps a network failure to unavailable and an abort to timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(provider.complete(request())).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    );
    const pending = provider.complete(request(controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
  });

  it('never puts the API key in an error message', async () => {
    stubFetch(401, { error: { message: 'invalid key sk-test' } });
    const err = (await provider.complete(request()).catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('sk-test');
  });
});
