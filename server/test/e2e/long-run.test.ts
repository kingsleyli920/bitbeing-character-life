import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer } from '../helpers/server-process.js';

describe('101 chapters over HTTP with the fixture model (engineering check, not story quality)', () => {
  let server: ServerProcess;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server?.stop();
  });

  it('writes 101 consecutive chapters, 10 arc summaries, and keeps every prompt within budget', async () => {
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${server.baseUrl}${path}`, {
        method,
        ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      return (await res.json()) as Record<string, any>;
    };
    const story = await call('POST', '/api/characters/song-zhiwei/stories', {});
    for (let n = 1; n <= 101; n++) {
      const { job } = await call('POST', `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
      let status = job.status;
      while (status === 'queued' || status === 'running') {
        await new Promise((r) => setTimeout(r, 5));
        status = (await call('GET', `/api/stories/${story.id}/jobs/${job.id}`)).job.status;
      }
      expect(status, `chapter ${n}`).toBe('succeeded');
    }

    const detail = await call('GET', `/api/stories/${story.id}`);
    expect(detail.chapterCount).toBe(101);
    const toc = await call('GET', `/api/stories/${story.id}/toc`);
    expect(toc.items.map((i: { number: number }) => i.number)).toEqual(Array.from({ length: 101 }, (_, i) => i + 1));
    const memory = await call('GET', `/api/stories/${story.id}/memory`);
    expect(memory.arcSummaries).toHaveLength(10);

    const db = new DatabaseSync(server.dbPath, { readOnly: true });
    const rows = db.prepare('SELECT context_stats FROM jobs WHERE story_id = ?').all(story.id) as { context_stats: string }[];
    db.close();
    const totals = rows.map((r) => JSON.parse(r.context_stats).totalTokens as number);
    expect(Math.max(...totals)).toBeLessThanOrEqual(12_000);
  }, 120_000);
});
