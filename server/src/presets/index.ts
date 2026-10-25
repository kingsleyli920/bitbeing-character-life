import fs from 'node:fs';
import path from 'node:path';
import { characterCardSchema, type CharacterCard, type CharacterProfile, characterProfileSchema } from '@cl/shared';
import type { Db } from '../db/open.js';

export const PRESET_IDS = ['lin-wan', 'zhou-ye', 'song-zhiwei', 'chen-yifan', 'a-xiu'] as const;

export function loadPresetCards(): { id: string; card: CharacterCard }[] {
  return PRESET_IDS.map((id) => {
    const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `${id}.json`), 'utf8'));
    return { id, card: characterCardSchema.parse(raw) };
  });
}

/** The committed profile for a preset (generated once by scripts/generate-preset-profiles.ts), if any. */
export function loadPresetProfile(id: string): CharacterProfile | null {
  const file = path.join(import.meta.dirname, `${id}.profile.json`);
  return fs.existsSync(file) ? characterProfileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
}

/** Inserts or refreshes the preset characters and their committed profiles. Existing stories keep their own snapshots. */
export function seedPresets(db: Db, now: string, opts: { withProfiles?: boolean } = {}): void {
  const stmt = db.prepare(
    `INSERT INTO characters (id, source, card_json, sort_key, created_at)
     VALUES (?, 'preset', ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET card_json = excluded.card_json, sort_key = excluded.sort_key
     WHERE characters.source = 'preset'`,
  );
  loadPresetCards().forEach(({ id, card }, index) => stmt.run(id, JSON.stringify(card), index, now));
  if (opts.withProfiles === false) return;
  const setProfile = db.prepare(
    `UPDATE characters SET profile_json = ?, profile_status = 'ready', profile_error = NULL WHERE id = ? AND source = 'preset'`,
  );
  for (const id of PRESET_IDS) {
    const profile = loadPresetProfile(id);
    if (profile) setProfile.run(JSON.stringify(profile), id);
  }
}
