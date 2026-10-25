import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, SCHEMA_V1_SQL, SCHEMA_VERSION } from './schema.js';

export type Db = DatabaseSync;

/** SQLite extended result code for a UNIQUE constraint violation. */
export const SQLITE_CONSTRAINT_UNIQUE = 2067;

export function isUniqueViolation(err: unknown): boolean {
  return (err as { errcode?: number } | null)?.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (current > SCHEMA_VERSION) {
    throw new Error(`数据库版本 ${current} 比代码支持的 ${SCHEMA_VERSION} 新，请升级代码或删除 ${dbPath}`);
  }
  if (current === 0) {
    db.exec(SCHEMA_V1_SQL);
    db.exec('PRAGMA user_version = 1');
  }
  for (const step of MIGRATIONS.filter((m) => m.version > Math.max(current, 1))) {
    transaction(db, () => {
      db.exec(step.sql);
      db.exec(`PRAGMA user_version = ${step.version}`);
    });
  }
  return db;
}

/** Runs `fn` inside BEGIN IMMEDIATE … COMMIT; rolls back explicitly on any error. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Removes every row (test reset). Keeps the schema. */
export function clearAll(db: Db): void {
  transaction(db, () => {
    for (const table of [
      'model_calls',
      'jobs',
      'arc_summaries',
      'trait_changes',
      'memories',
      'chapters',
      'directions',
      'stories',
      'characters',
    ]) {
      db.exec(`DELETE FROM ${table}`);
    }
  });
}
