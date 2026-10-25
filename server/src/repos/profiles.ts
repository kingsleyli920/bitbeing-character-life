import { type CharacterProfile, characterProfileSchema, type ProfileState, type ProfileStatus } from '@cl/shared';
import type { Db } from '../db/open.js';

interface Row {
  profile_json: string | null;
  profile_status: ProfileStatus;
  profile_error: string | null;
}

const parse = (json: string | null): CharacterProfile | null => (json ? characterProfileSchema.parse(JSON.parse(json)) : null);

export function getProfileState(db: Db, characterId: string): ProfileState {
  const row = db.prepare('SELECT profile_json, profile_status, profile_error FROM characters WHERE id = ?').get(characterId) as Row | undefined;
  if (!row) return { status: 'none', profile: null, error: null };
  return { status: row.profile_status, profile: parse(row.profile_json), error: row.profile_error };
}

/** Claims the profile for (re)generation; false when one is already running. */
export function markProfilePending(db: Db, characterId: string): boolean {
  const res = db
    .prepare(`UPDATE characters SET profile_status = 'pending', profile_error = NULL WHERE id = ? AND profile_status != 'pending'`)
    .run(characterId);
  return Number(res.changes) === 1;
}

export function saveProfile(db: Db, characterId: string, profile: CharacterProfile): void {
  db.prepare(`UPDATE characters SET profile_json = ?, profile_status = 'ready', profile_error = NULL WHERE id = ?`).run(
    JSON.stringify(profile),
    characterId,
  );
}

/** Keeps any earlier ready profile JSON, so a failed refresh does not lose it. */
export function failProfile(db: Db, characterId: string, error: string): void {
  db.prepare(
    `UPDATE characters SET profile_status = CASE WHEN profile_json IS NULL THEN 'failed' ELSE 'ready' END, profile_error = ? WHERE id = ?`,
  ).run(error, characterId);
}

/** The profile frozen into a story when its first chapter was requested, if any. */
export function getStoryProfileSnapshot(db: Db, storyId: string): CharacterProfile | null {
  const row = db.prepare('SELECT profile_snapshot FROM stories WHERE id = ?').get(storyId) as { profile_snapshot: string | null } | undefined;
  return parse(row?.profile_snapshot ?? null);
}

/** Copies the character's ready profile into the story. Only call before chapter 1 exists. */
export function snapshotProfile(db: Db, storyId: string, characterId: string): void {
  db.prepare(
    `UPDATE stories SET profile_snapshot = (SELECT profile_json FROM characters WHERE id = ? AND profile_status = 'ready')
      WHERE id = ? AND chapter_count = 0`,
  ).run(characterId, storyId);
}
