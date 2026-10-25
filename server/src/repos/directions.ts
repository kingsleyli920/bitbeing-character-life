import type { Direction } from '@cl/shared';
import type { Db } from '../db/open.js';

interface DirectionRow {
  id: string;
  text: string;
  created_at: string;
  effective_from_chapter: number;
}

export function getDirection(db: Db, storyId: string, directionId: string): Direction | undefined {
  const row = db
    .prepare('SELECT id, text, created_at, effective_from_chapter FROM directions WHERE story_id = ? AND id = ?')
    .get(storyId, directionId) as DirectionRow | undefined;
  return row && { id: row.id, text: row.text, createdAt: row.created_at, effectiveFromChapter: row.effective_from_chapter };
}
