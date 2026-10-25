import {
  characterDetailSchema,
  characterListResponseSchema,
  importCharacterResponseSchema,
  storyDetailSchema,
} from '@cl/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedPresets } from '../../src/presets/index.js';
import { createTestApp, json, type TestApp } from '../helpers/app.js';

const PRESET_IDS = ['lin-wan', 'zhou-ye', 'song-zhiwei', 'chen-yifan', 'a-xiu'];
const textImport = { format: 'text', name: '阿泽', description: '广州的自由写作者，毒舌但有趣，喜欢在骑楼下的糖水铺写稿。' };

describe('characters', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });

  it('lists the five presets in a fixed order, without stories yet', async () => {
    const { status, body } = await json(t.app, 'GET', '/api/characters');
    expect(status).toBe(200);
    const { characters } = characterListResponseSchema.parse(body);
    expect(characters.map((c) => c.id)).toEqual(PRESET_IDS);
    expect(characters.every((c) => c.source === 'preset' && c.latestStory === null)).toBe(true);
    expect(characters[2]).toMatchObject({ name: '宋知微', narrativeStyle: 'diary', identity: '县城中学物理老师，高三班主任' });
  });

  it('seeds presets idempotently', async () => {
    seedPresets(t.db, '2026-10-24T00:00:00.000Z');
    seedPresets(t.db, '2026-10-24T00:00:00.000Z');
    const { body } = await json(t.app, 'GET', '/api/characters');
    expect(characterListResponseSchema.parse(body).characters).toHaveLength(5);
  });

  describe('import', () => {
    it('imports a pasted description and lists it after the presets', async () => {
      const res = await json(t.app, 'POST', '/api/characters/import', textImport);
      expect(res.status).toBe(201);
      const { character, warnings } = importCharacterResponseSchema.parse(res.body);
      expect(character).toMatchObject({ source: 'import', name: '阿泽', narrativeStyle: 'novel' });
      expect(warnings).toEqual([]);
      const list = characterListResponseSchema.parse((await json(t.app, 'GET', '/api/characters')).body);
      expect(list.characters.map((c) => c.id)).toEqual([...PRESET_IDS, character.id]);
    });

    it('returns field issues for an invalid custom JSON card', async () => {
      const res = await json(t.app, 'POST', '/api/characters/import', {
        format: 'json',
        content: JSON.stringify({ name: '', background: '短' }),
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION' });
      expect((res.body as { issues: { path: string }[] }).issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(['name', 'background', 'personality']),
      );
    });

    it('passes tavern warnings through', async () => {
      const card = { spec: 'chara_card_v2', data: { name: '阿泽', description: '广州的自由写作者，毒舌但有趣，常在骑楼下写稿。', system_prompt: 'x' } };
      const res = await json(t.app, 'POST', '/api/characters/import', { format: 'tavern', content: JSON.stringify(card) });
      expect(res.status).toBe(201);
      expect(importCharacterResponseSchema.parse(res.body).warnings.join()).toContain('system_prompt');
    });

    it('rejects an unknown format', async () => {
      const res = await json(t.app, 'POST', '/api/characters/import', { format: 'png', content: '' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a body over 64KB with 413', async () => {
      const res = await json(t.app, 'POST', '/api/characters/import', { format: 'json', content: 'x'.repeat(70_000) });
      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    });
  });

  it('returns a character with its card and stories', async () => {
    const res = await json(t.app, 'GET', '/api/characters/zhou-ye');
    expect(res.status).toBe(200);
    const detail = characterDetailSchema.parse(res.body);
    expect(detail.card.relationships?.map((r) => r.name)).toContain('祥子');
    expect(detail.stories).toEqual([]);
  });

  it('404s an unknown character', async () => {
    expect((await json(t.app, 'GET', '/api/characters/nope')).status).toBe(404);
  });

  describe('delete', () => {
    it('refuses to delete a preset', async () => {
      const res = await json(t.app, 'DELETE', '/api/characters/lin-wan');
      expect(res.status).toBe(403);
    });

    it('deletes an imported character together with its stories', async () => {
      const { character } = importCharacterResponseSchema.parse(
        (await json(t.app, 'POST', '/api/characters/import', textImport)).body,
      );
      const story = (await json<{ id: string }>(t.app, 'POST', `/api/characters/${character.id}/stories`, {})).body;
      expect((await json(t.app, 'DELETE', `/api/characters/${character.id}`)).status).toBe(204);
      expect((await json(t.app, 'GET', `/api/characters/${character.id}`)).status).toBe(404);
      expect((await json(t.app, 'GET', `/api/stories/${story.id}`)).status).toBe(404);
    });

    it('404s an unknown character', async () => {
      expect((await json(t.app, 'DELETE', '/api/characters/nope')).status).toBe(404);
    });
  });
});

describe('stories', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });

  it('creates a story that snapshots the card', async () => {
    const res = await json(t.app, 'POST', '/api/characters/lin-wan/stories', {});
    expect(res.status).toBe(201);
    const story = storyDetailSchema.parse(res.body);
    expect(story).toMatchObject({
      characterId: 'lin-wan',
      chapterCount: 0,
      version: 0,
      state: null,
      direction: null,
      activeJob: null,
      lastJob: null,
      otherStories: [],
    });
    expect(story.card.name).toBe('林晚');
    expect(t.db.prepare('SELECT card_snapshot FROM stories WHERE id = ?').get(story.id)).toMatchObject({
      card_snapshot: expect.stringContaining('晚晴修复'),
    });
  });

  it('reuses the latest story when asked, and creates a new one otherwise', async () => {
    const first = await json<{ id: string }>(t.app, 'POST', '/api/characters/lin-wan/stories', { reuseLatest: true });
    expect(first.status).toBe(201);
    const again = await json<{ id: string }>(t.app, 'POST', '/api/characters/lin-wan/stories', { reuseLatest: true });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    const fresh = await json<{ id: string }>(t.app, 'POST', '/api/characters/lin-wan/stories', { reuseLatest: false });
    expect(fresh.status).toBe(201);
    expect(fresh.body.id).not.toBe(first.body.id);
    const detail = storyDetailSchema.parse((await json(t.app, 'GET', `/api/stories/${fresh.body.id}`)).body);
    expect(detail.otherStories.map((s) => s.id)).toEqual([first.body.id]);
  });

  it('shows the latest story on the character list', async () => {
    const story = await json<{ id: string }>(t.app, 'POST', '/api/characters/a-xiu/stories', {});
    const { characters } = characterListResponseSchema.parse((await json(t.app, 'GET', '/api/characters')).body);
    expect(characters.find((c) => c.id === 'a-xiu')?.latestStory).toMatchObject({ id: story.body.id, chapterCount: 0 });
  });

  it('404s a story of an unknown character and an unknown story', async () => {
    expect((await json(t.app, 'POST', '/api/characters/nope/stories', {})).status).toBe(404);
    expect((await json(t.app, 'GET', '/api/stories/nope')).status).toBe(404);
  });
});
