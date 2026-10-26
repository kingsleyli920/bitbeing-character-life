import type { ChapterDraft } from '@cl/shared';

/** A valid chapter draft for tests; override fields as needed. */
export function makeDraft(over: Partial<ChapterDraft> = {}): ChapterDraft {
  return {
    title: '雨夜的鼓点',
    storyTime: '十月第二个周三，夜',
    storyDate: '2026-10-14',
    location: '成都，春熙路后巷',
    body: `${'雨下得很大，周野把电动车停在檐下。'.repeat(40)}老曾的 livehouse 还亮着灯。`,
    summary: '周野因超时被扣奖励，又被场地老板限期报出主唱名字，否则专场取消。他找不到人选。',
    beatTags: ['送单受挫', '乐队危机'],
    lifeAreas: ['工作学业', '钱'],
    state: {
      time: '十月第二个周三深夜',
      location: '成都',
      situation: '主唱退出，专场面临取消',
      goals: ['明天中午前找到主唱'],
      mood: '焦躁但不服输',
    },
    memoryOps: [
      { op: 'upsert', kind: 'person', key: '老曾', content: 'livehouse 老板，限期报主唱', importance: 2, status: 'active' },
      { op: 'upsert', kind: 'promise', key: '报主唱名字', content: '答应老曾明天中午前报名字', importance: 3, status: 'open' },
    ],
    traitChanges: [],
    directionHandling: null,
    ...over,
  };
}
