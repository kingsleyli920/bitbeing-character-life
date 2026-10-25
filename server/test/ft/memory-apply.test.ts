import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/db/open.js';
import { seedPresets, loadPresetCards } from '../../src/presets/index.js';
import { getMemory, listMemories } from '../../src/repos/memories.js';
import { createStory } from '../../src/repos/stories.js';
import { applyMemoryOps } from '../../src/services/memory-apply.js';

const NOW = '2026-10-24T00:00:00.000Z';

describe('applyMemoryOps', () => {
  let db: Db;
  let storyId: string;
  let otherStoryId: string;
  beforeEach(() => {
    db = openDb(':memory:');
    seedPresets(db, NOW);
    const card = loadPresetCards()[1]!.card;
    storyId = createStory(db, 'zhou-ye', card, NOW).id;
    otherStoryId = createStory(db, 'zhou-ye', card, NOW).id;
  });

  it('inserts new entries with normalised status and source chapter', () => {
    const warnings = applyMemoryOps(db, storyId, 1, [
      { op: 'upsert', kind: 'person', key: '老曾', content: '老板', importance: 2, status: 'open' },
      { op: 'upsert', kind: 'thread', key: '定金', content: '骗来的定金', importance: 3, status: 'active' },
    ], NOW);
    expect(warnings).toEqual([]);
    expect(getMemory(db, storyId, '老曾')).toMatchObject({ status: 'active', sourceChapters: [1], firstChapter: 1, lastChapter: 1 });
    expect(getMemory(db, storyId, '定金')).toMatchObject({ status: 'open' });
  });

  it('updates an existing entry and appends the chapter once', () => {
    applyMemoryOps(db, storyId, 1, [{ op: 'upsert', kind: 'person', key: '老曾', content: '老板', importance: 1, status: 'active' }], NOW);
    applyMemoryOps(db, storyId, 3, [{ op: 'upsert', kind: 'person', key: '老曾', content: '老板，愿意宽限一天', importance: 2, status: 'active' }], NOW);
    applyMemoryOps(db, storyId, 3, [{ op: 'upsert', kind: 'person', key: '老曾', content: '老板，愿意宽限一天', importance: 2, status: 'active' }], NOW);
    expect(getMemory(db, storyId, '老曾')).toMatchObject({
      content: '老板，愿意宽限一天',
      importance: 2,
      sourceChapters: [1, 3],
      firstChapter: 1,
      lastChapter: 3,
    });
  });

  it('keeps the original kind when an update names a different kind, with a warning', () => {
    applyMemoryOps(db, storyId, 1, [{ op: 'upsert', kind: 'person', key: '阿May', content: '前主唱', importance: 2, status: 'active' }], NOW);
    const warnings = applyMemoryOps(db, storyId, 2, [
      { op: 'upsert', kind: 'thread', key: '阿May', content: '前主唱，退出原因未明', importance: 2, status: 'open' },
    ], NOW);
    expect(getMemory(db, storyId, '阿May')).toMatchObject({ kind: 'person', status: 'active', content: '前主唱，退出原因未明' });
    expect(warnings[0]).toContain('阿May');
  });

  it('resolves an open thread and keeps both the setup and the outcome', () => {
    applyMemoryOps(db, storyId, 1, [{ op: 'upsert', kind: 'promise', key: '报主唱名字', content: '答应中午前报名字', importance: 3, status: 'open' }], NOW);
    applyMemoryOps(db, storyId, 2, [{ op: 'resolve', kind: 'promise', key: '报主唱名字', content: '报了赵小棠', importance: 3, status: 'resolved' }], NOW);
    expect(getMemory(db, storyId, '报主唱名字')).toMatchObject({
      status: 'resolved',
      content: expect.stringMatching(/答应中午前报名字[\s\S]*报了赵小棠/),
      sourceChapters: [1, 2],
    });
  });

  it('drops a resolve for an unknown key with a warning', () => {
    const warnings = applyMemoryOps(db, storyId, 2, [
      { op: 'resolve', kind: 'thread', key: '不存在', content: '解决了', importance: 1, status: 'resolved' },
    ], NOW);
    expect(warnings[0]).toContain('不存在');
    expect(listMemories(db, storyId)).toEqual([]);
  });

  it('never touches another story with the same key (T4)', () => {
    applyMemoryOps(db, otherStoryId, 1, [{ op: 'upsert', kind: 'person', key: '老曾', content: '另一个故事里的老曾', importance: 1, status: 'active' }], NOW);
    applyMemoryOps(db, storyId, 1, [{ op: 'upsert', kind: 'person', key: '老曾', content: '这个故事里的老曾', importance: 1, status: 'active' }], NOW);
    expect(getMemory(db, otherStoryId, '老曾')?.content).toBe('另一个故事里的老曾');
    expect(getMemory(db, storyId, '老曾')?.content).toBe('这个故事里的老曾');
  });
});
