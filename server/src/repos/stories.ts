import { randomUUID } from 'node:crypto';
import {
  type CharacterCard,
  characterCardSchema,
  type StoryState,
  storyStateSchema,
  type StorySummary,
} from '@cl/shared';
import type { Db } from '../db/open.js';

interface StoryRow {
  id: string;
  character_id: string;
  card_snapshot: string;
  state: string | null;
  version: number;
  chapter_count: number;
  active_direction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryRecord {
  id: string;
  characterId: string;
  card: CharacterCard;
  state: StoryState | null;
  version: number;
  chapterCount: number;
  activeDirectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: StoryRow): StoryRecord {
  return {
    id: row.id,
    characterId: row.character_id,
    card: characterCardSchema.parse(JSON.parse(row.card_snapshot)),
    state: row.state ? storyStateSchema.parse(JSON.parse(row.state)) : null,
    version: row.version,
    chapterCount: row.chapter_count,
    activeDirectionId: row.active_direction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createStory(db: Db, characterId: string, card: CharacterCard, now: string): StoryRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO stories (id, character_id, card_snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, characterId, JSON.stringify(card), now, now);
  return getStory(db, id)!;
}

export function getStory(db: Db, storyId: string): StoryRecord | undefined {
  const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as StoryRow | undefined;
  return row && toRecord(row);
}

export function latestStoryId(db: Db, characterId: string): string | undefined {
  const row = db
    .prepare('SELECT id FROM stories WHERE character_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1')
    .get(characterId) as { id: string } | undefined;
  return row?.id;
}

export function listStorySummaries(db: Db, characterId: string): StorySummary[] {
  const rows = db
    .prepare(
      `SELECT id, chapter_count, created_at, updated_at FROM stories
        WHERE character_id = ? ORDER BY updated_at DESC, rowid DESC`,
    )
    .all(characterId) as Pick<StoryRow, 'id' | 'chapter_count' | 'created_at' | 'updated_at'>[];
  return rows.map((r) => ({ id: r.id, chapterCount: r.chapter_count, createdAt: r.created_at, updatedAt: r.updated_at }));
}
