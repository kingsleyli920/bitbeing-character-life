import { randomUUID } from 'node:crypto';
import type { MemoryItem, MemoryKind, MemoryResponse, MemoryStatus, TraitChange } from '@cl/shared';
import type { Db } from '../db/open.js';

interface MemoryRow {
  id: string;
  kind: MemoryKind;
  key: string;
  content: string;
  importance: number;
  status: MemoryStatus;
  source_chapters: string;
  first_chapter: number;
  last_chapter: number;
}

function toItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    content: row.content,
    importance: row.importance,
    status: row.status,
    sourceChapters: JSON.parse(row.source_chapters) as number[],
    firstChapter: row.first_chapter,
    lastChapter: row.last_chapter,
  };
}

export function listMemories(db: Db, storyId: string): MemoryItem[] {
  const rows = db
    .prepare('SELECT * FROM memories WHERE story_id = ? ORDER BY importance DESC, last_chapter DESC, key')
    .all(storyId) as unknown as MemoryRow[];
  return rows.map(toItem);
}

export function getMemory(db: Db, storyId: string, key: string): MemoryItem | undefined {
  const row = db.prepare('SELECT * FROM memories WHERE story_id = ? AND key = ?').get(storyId, key) as MemoryRow | undefined;
  return row && toItem(row);
}

export function insertMemory(
  db: Db,
  storyId: string,
  m: Omit<MemoryItem, 'id' | 'sourceChapters' | 'firstChapter' | 'lastChapter'> & { chapter: number; now: string },
): void {
  db.prepare(
    `INSERT INTO memories (id, story_id, kind, key, content, importance, status, source_chapters, first_chapter, last_chapter, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), storyId, m.kind, m.key, m.content, m.importance, m.status, JSON.stringify([m.chapter]), m.chapter, m.chapter, m.now);
}

export function updateMemory(
  db: Db,
  storyId: string,
  key: string,
  patch: { content: string; importance: number; status: MemoryStatus; sourceChapters: number[]; lastChapter: number; now: string },
): void {
  db.prepare(
    `UPDATE memories SET content = ?, importance = ?, status = ?, source_chapters = ?, last_chapter = ?, updated_at = ?
      WHERE story_id = ? AND key = ?`,
  ).run(patch.content, patch.importance, patch.status, JSON.stringify(patch.sourceChapters), patch.lastChapter, patch.now, storyId, key);
}

export function insertTraitChange(db: Db, storyId: string, chapterNumber: number, t: TraitChange): void {
  db.prepare(
    `INSERT INTO trait_changes (id, story_id, chapter_number, trait, from_text, to_text, cause_chapters, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), storyId, chapterNumber, t.trait, t.from, t.to, JSON.stringify(t.causeChapters), t.explanation);
}

export function listTraitChanges(db: Db, storyId: string): MemoryResponse['traitChanges'] {
  const rows = db
    .prepare(
      `SELECT chapter_number, trait, from_text, to_text, cause_chapters, explanation FROM trait_changes
        WHERE story_id = ? ORDER BY chapter_number, rowid`,
    )
    .all(storyId) as unknown as {
    chapter_number: number;
    trait: string;
    from_text: string;
    to_text: string;
    cause_chapters: string;
    explanation: string;
  }[];
  return rows.map((r) => ({
    chapterNumber: r.chapter_number,
    trait: r.trait,
    from: r.from_text,
    to: r.to_text,
    causeChapters: JSON.parse(r.cause_chapters) as number[],
    explanation: r.explanation,
  }));
}

export function listArcSummaries(db: Db, storyId: string): MemoryResponse['arcSummaries'] {
  return db
    .prepare(
      `SELECT from_chapter AS fromChapter, to_chapter AS toChapter, summary FROM arc_summaries
        WHERE story_id = ? ORDER BY from_chapter`,
    )
    .all(storyId) as unknown as MemoryResponse['arcSummaries'];
}

/** Idempotent: a second insert for the same range is ignored. */
export function insertArcSummary(db: Db, storyId: string, fromChapter: number, toChapter: number, summary: string, now: string): void {
  db.prepare(
    `INSERT INTO arc_summaries (story_id, from_chapter, to_chapter, summary, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (story_id, from_chapter) DO NOTHING`,
  ).run(storyId, fromChapter, toChapter, summary, now);
}
