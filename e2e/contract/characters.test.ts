import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ServerProcess, startServer } from '../../server/test/helpers/server-process.js';
import { ApiError, createApiClient } from '../../web/src/api/client.js';

describe('contract: characters and stories', () => {
  let server: ServerProcess;
  let api: ReturnType<typeof createApiClient>;
  beforeAll(async () => {
    server = await startServer();
    api = createApiClient(server.baseUrl);
  });
  afterAll(async () => {
    await server?.stop();
  });

  it('lists, imports, opens and deletes through the shared schemas', async () => {
    const { characters } = await api.listCharacters();
    expect(characters).toHaveLength(5);
    const { character, warnings } = await api.importCharacter({
      format: 'text',
      name: '阿泽',
      description: '广州的自由写作者，毒舌但有趣，喜欢在骑楼下的糖水铺写稿。',
    });
    expect(warnings).toEqual([]);
    expect((await api.getCharacter(character.id)).card.name).toBe('阿泽');
    const story = await api.openStory(character.id, { reuseLatest: true });
    expect(await api.getStory(story.id)).toMatchObject({ id: story.id, chapterCount: 0 });
    await expect(api.deleteCharacter(character.id)).resolves.toBeUndefined();
  });

  it('parses validation errors with field issues', async () => {
    const err = await api.importCharacter({ format: 'json', content: '{}' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION' });
    expect((err as ApiError).body).toMatchObject({ issues: expect.arrayContaining([{ path: 'name', message: '请填写姓名' }]) });
  });

  it('parses 403 and 404 errors', async () => {
    await expect(api.deleteCharacter('lin-wan')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(api.getStory('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
