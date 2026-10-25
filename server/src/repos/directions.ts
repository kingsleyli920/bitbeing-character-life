import { randomUUID } from 'node:crypto';
import type { Direction } from '@cl/shared';
import type { Db } from '../db/open.js';

interface DirectionRow {
  id: string;
  text: string;
  created_at: string;
  effective_from_chapter: number;
}

const toDirection = (row: DirectionRow): Direction => ({
  id: row.id,
  text: row.text,
  createdAt: row.created_at,
  effectiveFromChapter: row.effective_from_chapter,
});

export function getDirection(db: Db, storyId: string, directionId: string): Direction | undefined {
  const row = db
    .prepare('SELECT id, text, created_at, effective_from_chapter FROM directions WHERE story_id = ? AND id = ?')
    .get(storyId, directionId) as DirectionRow | undefined;
  return row && toDirection(row);
}

/** Replaces the story's current direction. Does not change `stories.version` (T7). Call inside a transaction. */
export function setDirection(db: Db, storyId: string, text: string, effectiveFromChapter: number, now: string): Direction {
  db.prepare('UPDATE directions SET cleared_at = ? WHERE story_id = ? AND cleared_at IS NULL').run(now, storyId);
  const id = randomUUID();
  db.prepare(
    'INSERT INTO directions (id, story_id, text, created_at, effective_from_chapter) VALUES (?, ?, ?, ?, ?)',
  ).run(id, storyId, text, now, effectiveFromChapter);
  db.prepare('UPDATE stories SET active_direction_id = ? WHERE id = ?').run(id, storyId);
  return { id, text, createdAt: now, effectiveFromChapter };
}

/** Clears the current direction. Call inside a transaction. */
export function clearDirection(db: Db, storyId: string, now: string): void {
  db.prepare('UPDATE directions SET cleared_at = ? WHERE story_id = ? AND cleared_at IS NULL').run(now, storyId);
  db.prepare('UPDATE stories SET active_direction_id = NULL WHERE id = ?').run(storyId);
}
