import {
  chaptersResponseSchema,
  characterDetailSchema,
  characterListResponseSchema,
  errorResponseSchema,
  type ImportCharacterRequest,
  importCharacterResponseSchema,
  metaResponseSchema,
  directionResponseSchema,
  jobResponseSchema,
  memoryResponseSchema,
  type OpenStoryRequest,
  storyDetailSchema,
  tocResponseSchema,
} from '@cl/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<S extends z.ZodType>(schema: S, url: string, init?: RequestInit): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'NETWORK', '网络连接失败，请检查服务是否启动');
  }
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'BAD_RESPONSE', '服务返回了无法解析的内容');
    }
  }
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) throw new ApiError(res.status, parsed.data.code, parsed.data.message, body);
    throw new ApiError(res.status, 'HTTP_ERROR', `请求失败（HTTP ${res.status}）`, body);
  }
  if (res.status === 204) body = undefined;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(res.status, 'BAD_RESPONSE', '服务返回的数据格式不符合约定', body);
  return parsed.data;
}

const jsonInit = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

export function createApiClient(baseUrl = '') {
  const url = (path: string) => `${baseUrl}/api${path}`;
  const id = encodeURIComponent;
  return {
    getMeta: () => request(metaResponseSchema, url('/meta')),
    listCharacters: () => request(characterListResponseSchema, url('/characters')),
    getCharacter: (characterId: string) => request(characterDetailSchema, url(`/characters/${id(characterId)}`)),
    importCharacter: (input: ImportCharacterRequest) =>
      request(importCharacterResponseSchema, url('/characters/import'), jsonInit('POST', input)),
    deleteCharacter: (characterId: string) =>
      request(z.undefined(), url(`/characters/${id(characterId)}`), { method: 'DELETE' }),
    openStory: (characterId: string, input: OpenStoryRequest = {}) =>
      request(storyDetailSchema, url(`/characters/${id(characterId)}/stories`), jsonInit('POST', input)),
    getStory: (storyId: string) => request(storyDetailSchema, url(`/stories/${id(storyId)}`)),
    listChapters: (storyId: string, opts: { from?: number; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (opts.from !== undefined) query.set('from', String(opts.from));
      if (opts.limit !== undefined) query.set('limit', String(opts.limit));
      const qs = query.toString();
      return request(chaptersResponseSchema, url(`/stories/${id(storyId)}/chapters${qs ? `?${qs}` : ''}`));
    },
    getToc: (storyId: string) => request(tocResponseSchema, url(`/stories/${id(storyId)}/toc`)),
    getMemory: (storyId: string) => request(memoryResponseSchema, url(`/stories/${id(storyId)}/memory`)),
    setDirection: (storyId: string, text: string) =>
      request(directionResponseSchema, url(`/stories/${id(storyId)}/direction`), jsonInit('PUT', { text })),
    clearDirection: (storyId: string) =>
      request(z.undefined(), url(`/stories/${id(storyId)}/direction`), { method: 'DELETE' }),
    createJob: (storyId: string, requestId: string) =>
      request(jobResponseSchema, url(`/stories/${id(storyId)}/jobs`), jsonInit('POST', { requestId })),
    getJob: (storyId: string, jobId: string) =>
      request(jobResponseSchema, url(`/stories/${id(storyId)}/jobs/${id(jobId)}`)),
    exportUrl: (storyId: string) => url(`/stories/${id(storyId)}/export.md`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export const api = createApiClient();
