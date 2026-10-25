import type { Chapter, ChapterDraft } from '@cl/shared';
import type { Db } from '../db/open.js';
import type { ChapterDigest } from '../services/context-builder.js';

interface ChapterRow {
  id: string;
  number: number;
  title: string;
  story_time: string;
  location: string;
  body: string;
  summary: string;
  beat_tags: string;
  direction_id: string | null;
  direction_text: string | null;
  direction_handling: string | null;
  job_id: string;
  created_at: string;
}

function toChapter(row: ChapterRow): Chapter {
  return {
    number: row.number,
    title: row.title,
    storyTime: row.story_time,
    location: row.location,
    body: row.body,
    summary: row.summary,
    beatTags: JSON.parse(row.beat_tags) as string[],
    direction: row.direction_id && row.direction_text !== null ? { id: row.direction_id, text: row.direction_text } : null,
    directionHandling: row.direction_handling ? JSON.parse(row.direction_handling) : null,
    jobId: row.job_id,
    createdAt: row.created_at,
  };
}

const SELECT = `SELECT c.*, d.text AS direction_text FROM chapters c
  LEFT JOIN directions d ON d.id = c.direction_id AND d.story_id = c.story_id`;

export function insertChapter(
  db: Db,
  storyId: string,
  row: { id: string; number: number; draft: ChapterDraft; directionId: string | null; jobId: string; now: string },
): void {
  const { draft } = row;
  db.prepare(
    `INSERT INTO chapters (id, story_id, number, title, story_time, location, body, summary, beat_tags,
                           direction_id, direction_handling, job_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    storyId,
    row.number,
    draft.title,
    draft.storyTime,
    draft.location,
    draft.body,
    draft.summary,
    JSON.stringify(draft.beatTags),
    row.directionId,
    draft.directionHandling ? JSON.stringify(draft.directionHandling) : null,
    row.jobId,
    row.now,
  );
}

export function listChapters(db: Db, storyId: string, fromNumber: number, limit: number): Chapter[] {
  const rows = db
    .prepare(`${SELECT} WHERE c.story_id = ? AND c.number >= ? ORDER BY c.number LIMIT ?`)
    .all(storyId, fromNumber, limit) as unknown as ChapterRow[];
  return rows.map(toChapter);
}

export function listAllChapters(db: Db, storyId: string): Chapter[] {
  const rows = db.prepare(`${SELECT} WHERE c.story_id = ? ORDER BY c.number`).all(storyId) as unknown as ChapterRow[];
  return rows.map(toChapter);
}

export function getChapter(db: Db, storyId: string, number: number): Chapter | undefined {
  const row = db.prepare(`${SELECT} WHERE c.story_id = ? AND c.number = ?`).get(storyId, number) as ChapterRow | undefined;
  return row && toChapter(row);
}

export function listToc(db: Db, storyId: string): { number: number; title: string; storyTime: string }[] {
  return db
    .prepare('SELECT number, title, story_time AS storyTime FROM chapters WHERE story_id = ? ORDER BY number')
    .all(storyId) as unknown as { number: number; title: string; storyTime: string }[];
}

/** Title, summary and beat tags of chapters before `beforeNumber`, oldest first. */
export function listDigests(db: Db, storyId: string, beforeNumber: number): ChapterDigest[] {
  const rows = db
    .prepare('SELECT number, title, summary, beat_tags FROM chapters WHERE story_id = ? AND number < ? ORDER BY number')
    .all(storyId, beforeNumber) as unknown as { number: number; title: string; summary: string; beat_tags: string }[];
  return rows.map((r) => ({ number: r.number, title: r.title, summary: r.summary, beatTags: JSON.parse(r.beat_tags) }));
}

export function getChapterBody(db: Db, storyId: string, number: number): string | undefined {
  const row = db.prepare('SELECT body FROM chapters WHERE story_id = ? AND number = ?').get(storyId, number) as
    | { body: string }
    | undefined;
  return row?.body;
}
