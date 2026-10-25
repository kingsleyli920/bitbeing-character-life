import { randomUUID } from 'node:crypto';
import { type CharacterCard, characterCardSchema, type CharacterSummary } from '@cl/shared';
import type { Db } from '../db/open.js';

interface CharacterRow {
  id: string;
  source: 'preset' | 'import';
  card_json: string;
  created_at: string;
}

export interface CharacterRecord {
  id: string;
  source: 'preset' | 'import';
  card: CharacterCard;
  createdAt: string;
}

function toRecord(row: CharacterRow): CharacterRecord {
  return { id: row.id, source: row.source, card: characterCardSchema.parse(JSON.parse(row.card_json)), createdAt: row.created_at };
}

export function insertImportedCharacter(db: Db, card: CharacterCard, now: string): CharacterRecord {
  const id = randomUUID();
  db.prepare(`INSERT INTO characters (id, source, card_json, sort_key, created_at) VALUES (?, 'import', ?, NULL, ?)`).run(
    id,
    JSON.stringify(card),
    now,
  );
  return { id, source: 'import', card, createdAt: now };
}

export function getCharacter(db: Db, id: string): CharacterRecord | undefined {
  const row = db.prepare('SELECT id, source, card_json, created_at FROM characters WHERE id = ?').get(id) as
    | CharacterRow
    | undefined;
  return row && toRecord(row);
}

export function deleteCharacter(db: Db, id: string): void {
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
}

export function toSummary(record: CharacterRecord, latest: CharacterSummary['latestStory']): CharacterSummary {
  const { card } = record;
  return {
    id: record.id,
    source: record.source,
    name: card.name,
    identity: card.identity ?? null,
    age: card.age ?? null,
    narrativeStyle: card.narrativeStyle,
    tagline: card.background.length > 60 ? `${card.background.slice(0, 60)}…` : card.background,
    latestStory: latest,
  };
}

/** Presets in their fixed order, then imported characters, newest first. */
export function listCharacters(db: Db): CharacterSummary[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.source, c.card_json, c.created_at,
              s.id AS story_id, s.chapter_count, s.created_at AS story_created_at, s.updated_at AS story_updated_at
         FROM characters c
         LEFT JOIN stories s ON s.id = (
           SELECT id FROM stories WHERE character_id = c.id ORDER BY updated_at DESC, rowid DESC LIMIT 1)
        ORDER BY c.source = 'import', c.sort_key, c.created_at DESC, c.rowid DESC`,
    )
    .all() as unknown as (CharacterRow & {
    story_id: string | null;
    chapter_count: number | null;
    story_created_at: string | null;
    story_updated_at: string | null;
  })[];
  return rows.map((row) =>
    toSummary(
      toRecord(row),
      row.story_id
        ? {
            id: row.story_id,
            chapterCount: row.chapter_count ?? 0,
            createdAt: row.story_created_at!,
            updatedAt: row.story_updated_at!,
          }
        : null,
    ),
  );
}
