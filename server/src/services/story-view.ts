import type { StoryDetail } from '@cl/shared';
import type { Db } from '../db/open.js';
import { getDirection } from '../repos/directions.js';
import { getActiveJobRow, getLastJobRow, toJob } from '../repos/jobs.js';
import { getProfileState, getStoryProfileSnapshot } from '../repos/profiles.js';
import { listStorySummaries, type StoryRecord } from '../repos/stories.js';

export function buildStoryDetail(db: Db, story: StoryRecord): StoryDetail {
  const active = getActiveJobRow(db, story.id);
  const last = getLastJobRow(db, story.id);
  return {
    id: story.id,
    characterId: story.characterId,
    card: story.card,
    ...storyProfile(db, story),
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

/** A story uses its frozen snapshot once chapter 1 exists; before that, the character's current profile. */
export function storyProfile(db: Db, story: StoryRecord): Pick<StoryDetail, 'profile' | 'profileFrozen'> {
  if (story.chapterCount > 0) {
    const snapshot = getStoryProfileSnapshot(db, story.id);
    return { profile: { status: snapshot ? 'ready' : 'none', profile: snapshot, error: null }, profileFrozen: true };
  }
  return { profile: getProfileState(db, story.characterId), profileFrozen: false };
}
