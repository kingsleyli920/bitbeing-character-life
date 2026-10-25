import { afterEach, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer, tempDbPath } from '../helpers/server-process.js';

describe('persistence across restarts', () => {
  let server: ServerProcess | undefined;
  afterEach(async () => {
    await server?.stop();
  });

  it('keeps imported characters and stories after a crash and restart', async () => {
    const dbPath = tempDbPath('persist');
    server = await startServer({ dbPath });
    const imported = await fetch(`${server.baseUrl}/api/characters/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'text', name: '阿泽', description: '广州的自由写作者，毒舌但有趣，喜欢在骑楼下写稿。' }),
    }).then((r) => r.json() as Promise<{ character: { id: string } }>);
    const story = await fetch(`${server.baseUrl}/api/characters/${imported.character.id}/stories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then((r) => r.json() as Promise<{ id: string }>);

    await server.kill();
    server = await startServer({ dbPath });

    const list = (await fetch(`${server.baseUrl}/api/characters`).then((r) => r.json())) as { characters: unknown[] };
    expect(list.characters).toHaveLength(6);
    const again = await fetch(`${server.baseUrl}/api/stories/${story.id}`);
    expect(again.status).toBe(200);
  });
});
