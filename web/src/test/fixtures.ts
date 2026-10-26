import type { Chapter, Job, StoryDetail } from '@cl/shared';

export const STORY_ID = 'story-1';

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    storyId: STORY_ID,
    requestId: '00000000-0000-4000-8000-000000000001',
    status: 'running',
    targetChapter: 1,
    directionId: null,
    model: 'fixture',
    promptVersion: 'chapter-v2',
    attempts: 1,
    errorCode: null,
    errorMessage: null,
    warnings: [],
    createdAt: '2026-10-24T10:00:00.000Z',
    startedAt: '2026-10-24T10:00:00.000Z',
    finishedAt: null,
    usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, costSource: 'unknown', latencyMs: null },
    ...over,
  };
}

export function makeStory(over: Partial<StoryDetail> = {}): StoryDetail {
  return {
    id: STORY_ID,
    characterId: 'zhou-ye',
    card: {
      name: '周野',
      age: '27 岁',
      identity: '外卖骑手，地下乐队鼓手',
      background: '成都外卖骑手，地下乐队「泥巴」的鼓手，想办一场专场。',
      personality: '嘴贫讲义气',
      narrativeStyle: 'novel',
    },
    profile: {
      status: 'ready',
      profile: {
        fields: [
          { key: 'name', value: '周野', source: 'original', reason: '' },
          { key: 'age', value: '27 岁', source: 'original', reason: '' },
          { key: 'economy', value: '手头不宽裕', source: 'inferred', reason: '每月还父亲一万八' },
          { key: 'signature', value: '手腕上一根旧皮编手绳', source: 'imagined', reason: '与鼓手身份相关' },
        ],
        model: 'fixture',
        createdAt: '2026-10-24T09:00:00.000Z',
      },
      error: null,
    },
    profileFrozen: false,
    state: null,
    chapterCount: 0,
    version: 0,
    direction: null,
    activeJob: null,
    lastJob: null,
    otherStories: [],
    createdAt: '2026-10-24T09:00:00.000Z',
    updatedAt: '2026-10-24T09:00:00.000Z',
    ...over,
  };
}

export function makeChapter(number: number, over: Partial<Chapter> = {}): Chapter {
  return {
    number,
    title: `第${number}章的标题`,
    storyTime: `第${number}天`,
    storyDate: null,
    lifeAreas: ['工作学业'],
    location: '成都',
    body: `第${number}章的第一段。\n\n第${number}章的第二段。`,
    summary: `第${number}章摘要`,
    beatTags: ['日常'],
    direction: null,
    directionHandling: null,
    jobId: `job-${number}`,
    createdAt: '2026-10-24T10:00:00.000Z',
    ...over,
  };
}
