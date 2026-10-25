import { randomUUID } from 'node:crypto';
import { errorResponseSchema } from '@cl/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer } from '../../server/test/helpers/server-process.js';
import { ApiError, createApiClient } from '../../web/src/api/client.js';

describe('contract: jobs, chapters, directions and memory', () => {
  let server: ServerProcess;
  let api: ReturnType<typeof createApiClient>;
  beforeAll(async () => {
    server = await startServer({ env: { FIXTURE_DELAY_MS: '200' } });
    api = createApiClient(server.baseUrl);
  });
  afterAll(async () => {
    await server?.stop();
  });

  async function waitForJob(storyId: string, jobId: string) {
    for (let i = 0; i < 100; i++) {
      const { job } = await api.getJob(storyId, jobId);
      if (job.status !== 'queued' && job.status !== 'running') return job;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('job did not finish');
  }

  it('runs a chapter through every endpoint with schema-valid responses', async () => {
    const story = await api.openStory('a-xiu', { reuseLatest: false });
    const { direction } = await api.setDirection(story.id, '让孙子慢慢喜欢上海岛');
    expect(direction.effectiveFromChapter).toBe(1);

    const requestId = randomUUID();
    const created = await api.createJob(story.id, requestId);
    expect(['queued', 'running']).toContain(created.job.status);
    const again = await api.createJob(story.id, requestId);
    expect(again.job.id).toBe(created.job.id);

    const conflict = await api.createJob(story.id, randomUUID()).catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(ApiError);
    expect(conflict).toMatchObject({ status: 409, code: 'JOB_IN_PROGRESS' });
    expect(errorResponseSchema.parse((conflict as ApiError).body).job?.id).toBe(created.job.id);

    expect(await waitForJob(story.id, created.job.id)).toMatchObject({ status: 'succeeded', targetChapter: 1 });
    const { chapters, total } = await api.listChapters(story.id);
    expect(total).toBe(1);
    expect(chapters[0]!.direction?.text).toBe('让孙子慢慢喜欢上海岛');
    expect((await api.getToc(story.id)).items).toHaveLength(1);
    expect((await api.getMemory(story.id)).items.length).toBeGreaterThan(0);
    await expect(api.clearDirection(story.id)).resolves.toBeUndefined();
    expect((await api.getStory(story.id)).direction).toBeNull();
  });

  it('parses validation and not-found errors', async () => {
    const story = await api.openStory('lin-wan');
    await expect(api.setDirection(story.id, 'x')).rejects.toMatchObject({ status: 400, code: 'VALIDATION' });
    await expect(api.createJob(story.id, 'not-a-uuid')).rejects.toMatchObject({ status: 400, code: 'VALIDATION' });
    await expect(api.getJob(story.id, 'missing')).rejects.toMatchObject({ status: 404 });
    await expect(api.listChapters(story.id, { limit: 99 })).rejects.toMatchObject({ status: 400 });
  });
});
