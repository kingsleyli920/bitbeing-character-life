import type { Direction } from '@cl/shared';
import type { Db } from '../db/open.js';
import { getChapter, getChapterBody, listDigests } from '../repos/chapters.js';
import { listArcSummaries, listMemories, listTraitChanges } from '../repos/memories.js';
import { getStoryProfileSnapshot } from '../repos/profiles.js';
import type { StoryRecord } from '../repos/stories.js';
import { ARC_SIZE, stitchedArc } from './arc-summary.js';
import type { ContextData } from './context-builder.js';

/** Reads everything the context builder may need for chapter `chapterNumber` of one story. */
export function loadContextData(db: Db, story: StoryRecord, chapterNumber: number, direction: Direction | null): ContextData {
  const previous = chapterNumber > 1 ? getChapter(db, story.id, chapterNumber - 1) : undefined;
  return {
    chapterNumber,
    card: story.card,
    profile: getStoryProfileSnapshot(db, story.id)?.fields ?? [],
    state: story.state,
    direction: direction ? { text: direction.text, chaptersActive: chapterNumber - direction.effectiveFromChapter } : null,
    memories: listMemories(db, story.id),
    traitChanges: listTraitChanges(db, story.id),
    arcSummaries: arcsWithFallback(db, story.id, chapterNumber),
    previousChapter: previous ? { number: previous.number, title: previous.title, body: previous.body } : null,
    chapterDigests: listDigests(db, story.id, chapterNumber),
    excerpt: (number, keyword, radius) => {
      const body = getChapterBody(db, story.id, number);
      if (!body) return null;
      const probes = [keyword, keyword.slice(0, 4), keyword.slice(0, 2)].filter((k) => k.length >= 2);
      const at = probes.map((k) => body.indexOf(k)).find((i) => i >= 0);
      if (at === undefined) return null;
      const start = Math.max(0, at - radius);
      return `${start > 0 ? '…' : ''}${body.slice(start, at + radius).replaceAll('\n', ' ')}…`;
    },
  };
}

/** Stored arc summaries, plus stitched chapter summaries for complete blocks whose arc is missing. */
function arcsWithFallback(db: Db, storyId: string, chapterNumber: number): ContextData['arcSummaries'] {
  const stored = new Map(listArcSummaries(db, storyId).map((a) => [a.fromChapter, a]));
  const out: ContextData['arcSummaries'] = [];
  for (let from = 1; from + ARC_SIZE - 1 < chapterNumber; from += ARC_SIZE) {
    const to = from + ARC_SIZE - 1;
    out.push(stored.get(from) ?? { fromChapter: from, toChapter: to, summary: stitchedArc(db, storyId, from, to) });
  }
  return out;
}
