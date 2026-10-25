import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/open.js';
import { SCHEMA_V1_SQL } from '../../src/db/schema.js';

describe('schema migration', () => {
  it('upgrades a version 1 database in place and keeps its rows', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-mig-')), 'v1.db');
    const v1 = new DatabaseSync(file);
    v1.exec(SCHEMA_V1_SQL);
    v1.exec('PRAGMA user_version = 1');
    v1.exec(`INSERT INTO characters VALUES ('c1', 'import', '{"name":"甲","background":"${'背'.repeat(20)}","narrativeStyle":"novel"}', NULL, 't')`);
    v1.exec(`INSERT INTO stories (id, character_id, card_snapshot, created_at, updated_at) VALUES ('s1', 'c1', '{}', 't', 't')`);
    v1.exec(`INSERT INTO jobs (id, story_id, request_id, status, base_version, target_chapter, model, prompt_version, created_at) VALUES ('j1', 's1', 'r1', 'succeeded', 0, 1, 'm', 'v', 't')`);
    v1.exec(`INSERT INTO model_calls (id, job_id, story_id, purpose, attempt, model, prompt_version, started_at, outcome, cost_usd, cost_source, request_json) VALUES ('m1', 'j1', 's1', 'chapter', 1, 'm', 'v', 't', 'ok', 0.01, 'reported', '{}')`);
    v1.close();

    const db = openDb(file);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 });
    expect(db.prepare('SELECT profile_status, profile_json FROM characters WHERE id = ?').get('c1')).toEqual({ profile_status: 'none', profile_json: null });
    expect(db.prepare('SELECT profile_snapshot FROM stories WHERE id = ?').get('s1')).toEqual({ profile_snapshot: null });
    expect(db.prepare('SELECT job_id, cost_usd, error_message FROM model_calls WHERE id = ?').get('m1')).toEqual({ job_id: 'j1', cost_usd: 0.01, error_message: null });
    // Profile calls have no job or story.
    db.prepare(
      `INSERT INTO model_calls (id, job_id, story_id, character_id, purpose, attempt, model, prompt_version, started_at, outcome, cost_source, request_json)
       VALUES ('m2', NULL, NULL, 'c1', 'profile', 1, 'm', 'v', 't', 'ok', 'unknown', '{}')`,
    ).run();
    db.close();
    // Opening again is a no-op.
    const again = openDb(file);
    expect(again.prepare('SELECT COUNT(*) AS n FROM model_calls').get()).toEqual({ n: 2 });
    again.close();
  });
});
