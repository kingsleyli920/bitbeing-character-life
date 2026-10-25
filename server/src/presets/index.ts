import fs from 'node:fs';
import path from 'node:path';
import { characterCardSchema, type CharacterCard } from '@cl/shared';
import type { Db } from '../db/open.js';

export const PRESET_IDS = ['lin-wan', 'zhou-ye', 'song-zhiwei', 'chen-yifan', 'a-xiu'] as const;

export function loadPresetCards(): { id: string; card: CharacterCard }[] {
  return PRESET_IDS.map((id) => {
    const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `${id}.json`), 'utf8'));
    return { id, card: characterCardSchema.parse(raw) };
  });
}

/** Inserts or refreshes the preset characters. Existing stories keep their own card snapshot. */
export function seedPresets(db: Db, now: string): void {
  const stmt = db.prepare(
    `INSERT INTO characters (id, source, card_json, sort_key, created_at)
     VALUES (?, 'preset', ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET card_json = excluded.card_json, sort_key = excluded.sort_key
     WHERE characters.source = 'preset'`,
  );
  loadPresetCards().forEach(({ id, card }, index) => stmt.run(id, JSON.stringify(card), index, now));
}
