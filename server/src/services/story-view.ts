import type { StoryDetail } from '@cl/shared';
import type { Db } from '../db/open.js';
import { getDirection } from '../repos/directions.js';
import { getActiveJobRow, getLastJobRow, toJob } from '../repos/jobs.js';
import { listStorySummaries, type StoryRecord } from '../repos/stories.js';

export function buildStoryDetail(db: Db, story: StoryRecord): StoryDetail {
  const active = getActiveJobRow(db, story.id);
  const last = getLastJobRow(db, story.id);
  return {
    id: story.id,
    characterId: story.characterId,
    card: story.card,
    state: story.state,
    chapterCount: story.chapterCount,
    version: story.version,
    direction: story.activeDirectionId ? (getDirection(db, story.id, story.activeDirectionId) ?? null) : null,
    activeJob: active ? toJob(db, active) : null,
    lastJob: last ? toJob(db, last) : null,
    otherStories: listStorySummaries(db, story.characterId).filter((s) => s.id !== story.id),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}
