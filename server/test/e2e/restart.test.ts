import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer, tempDbPath } from '../helpers/server-process.js';

const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
    (r) => r.json() as Promise<Record<string, any>>,
  );

describe('crash during generation (T6)', () => {
  let server: ServerProcess | undefined;
  afterEach(async () => {
    await server?.stop();
  });

  it('marks the job interrupted after a hard kill and never re-runs it', async () => {
    const dbPath = tempDbPath('restart');
    server = await startServer({ dbPath, env: { FIXTURE_DELAY_MS: '10000' } });
    const story = await post(server.baseUrl, '/api/characters/zhou-ye/stories', {});
    const { job } = await post(server.baseUrl, `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
    expect(['queued', 'running']).toContain(job.status);

    await server.kill();
    server = await startServer({ dbPath, env: { FIXTURE_DELAY_MS: '0' } });

    const after = await fetch(`${server.baseUrl}/api/stories/${story.id}`).then((r) => r.json() as Promise<Record<string, any>>);
    expect(after.activeJob).toBeNull();
    expect(after.lastJob).toMatchObject({ id: job.id, status: 'interrupted', errorCode: 'SERVER_RESTART' });
    await new Promise((r) => setTimeout(r, 300));
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE job_id = ?').get(job.id) as { n: number };
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM chapters WHERE story_id = ?').get(story.id) as { c: number };
    db.close();
    expect(n).toBe(0);
    expect(c).toBe(0);

    // The story can continue with a new request.
    const retry = await post(server.baseUrl, `/api/stories/${story.id}/jobs`, { requestId: randomUUID() });
    expect(retry.job.targetChapter).toBe(1);
  });
});
