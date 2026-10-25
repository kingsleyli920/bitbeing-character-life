import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeJob, STORY_ID } from '../test/fixtures';
import { server } from '../test/msw';
import { useGenerate } from './useGenerate';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function captureJobPosts(respond: (n: number) => Response | Promise<Response>) {
  const ids: string[] = [];
  server.use(
    http.post(`/api/stories/${STORY_ID}/jobs`, async ({ request }) => {
      ids.push(((await request.json()) as { requestId: string }).requestId);
      return respond(ids.length);
    }),
    http.get(`/api/stories/${STORY_ID}`, () => HttpResponse.json({})),
  );
  return ids;
}

describe('useGenerate', () => {
  it('sends one POST for a double click and can start again once it settles', async () => {
    const ids = captureJobPosts(() => HttpResponse.json({ job: makeJob() }, { status: 202 }));
    const onJob = vi.fn();
    const { result } = renderHook(() => useGenerate(STORY_ID, onJob), { wrapper: wrapper() });

    act(() => {
      result.current.start();
      result.current.start();
    });
    await waitFor(() => expect(onJob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isStarting).toBe(false));
    expect(ids).toHaveLength(1);

    act(() => result.current.start());
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('reuses the same requestId when retrying after a network failure', async () => {
    const ids = captureJobPosts((n) => (n === 1 ? HttpResponse.error() : HttpResponse.json({ job: makeJob() }, { status: 202 })));
    const { result } = renderHook(() => useGenerate(STORY_ID), { wrapper: wrapper() });
    act(() => result.current.start());
    await waitFor(() => expect(ids).toHaveLength(2), { timeout: 3000 });
    expect(ids[1]).toBe(ids[0]);
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('hands over the running job on 409 instead of showing an error', async () => {
    const running = makeJob({ id: 'job-running' });
    captureJobPosts(() => HttpResponse.json({ code: 'JOB_IN_PROGRESS', message: '正在生成', job: running }, { status: 409 }));
    const onJob = vi.fn();
    const { result } = renderHook(() => useGenerate(STORY_ID, onJob), { wrapper: wrapper() });
    act(() => result.current.start());
    await waitFor(() => expect(onJob).toHaveBeenCalledWith(running));
    expect(result.current.error).toBeNull();
  });

  it('surfaces a server error', async () => {
    captureJobPosts(() => HttpResponse.json({ code: 'NOT_FOUND', message: '故事不存在' }, { status: 404 }));
    const { result } = renderHook(() => useGenerate(STORY_ID), { wrapper: wrapper() });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'NOT_FOUND' }));
  });
});
