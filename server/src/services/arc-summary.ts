import type { Db } from '../db/open.js';
import { listDigests } from '../repos/chapters.js';
import { listArcSummaries, listMemories } from '../repos/memories.js';

export const ARC_SIZE = 10;

/** The earliest complete block of 10 chapters (before `targetChapter`) that has no arc summary yet. */
export function missingArc(db: Db, storyId: string, targetChapter: number): { from: number; to: number } | null {
  const done = new Set(listArcSummaries(db, storyId).map((a) => a.fromChapter));
  for (let from = 1; from + ARC_SIZE - 1 < targetChapter; from += ARC_SIZE) {
    if (!done.has(from)) return { from, to: from + ARC_SIZE - 1 };
  }
  return null;
}

/** User message for the arc summary call: the block's chapter summaries plus memory touched in it. */
export function arcPrompt(db: Db, storyId: string, characterName: string, from: number, to: number): string {
  const digests = listDigests(db, storyId, to + 1).filter((d) => d.number >= from);
  const touched = listMemories(db, storyId).filter((m) => m.sourceChapters.some((c) => c >= from && c <= to));
  return [
    `【主角】${characterName}`,
    `【第${from}–${to}章摘要】`,
    ...digests.map((d) => `- 第${d.number}章《${d.title}》：${d.summary}`),
    '【这一卷里变化过的记忆】',
    ...touched.map((m) => `- ${m.key}（${m.status === 'resolved' ? '已解决' : m.status === 'open' ? '未解决' : '记录'}）：${m.content}`),
    `【任务】为第${from}–${to}章写卷摘要。`,
  ].join('\n');
}

/** Fallback when an arc summary is missing: the block's chapter summaries, clipped and joined. */
export function stitchedArc(db: Db, storyId: string, from: number, to: number): string {
  return `（自动拼接）${listDigests(db, storyId, to + 1)
    .filter((d) => d.number >= from)
    .map((d) => d.summary.slice(0, 40))
    .join('；')}`;
}
