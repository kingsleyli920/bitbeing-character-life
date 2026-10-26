/**
 * Builds demo/demo.db from evaluation databases (real-model stories) for `npm run demo`.
 *   npx tsx scripts/build-demo-db.ts eval/out/multi/app.db eval/out/long/app.db ...
 * Full prompts are dropped from model_calls to keep the file small; everything else is copied as is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/src/db/open.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const target = path.join(ROOT, 'demo/demo.db');
const sources = process.argv.slice(2);
if (sources.length === 0) {
  console.error('用法：npx tsx scripts/build-demo-db.ts <评测数据库>...');
  process.exit(1);
}
fs.rmSync(target, { force: true });
const db = openDb(target);
const tables = ['characters', 'stories', 'directions', 'chapters', 'memories', 'trait_changes', 'arc_summaries', 'jobs'];
for (const source of sources) {
  db.exec(`ATTACH DATABASE '${path.resolve(source).replaceAll("'", "''")}' AS src`);
  db.exec('BEGIN');
  for (const table of tables) {
    // Sources may be older schema versions: copy the columns they have, newer ones keep their defaults.
    const cols = (db.prepare(`PRAGMA src.table_info(${table})`).all() as { name: string }[]).map((c) => c.name).join(', ');
    db.exec(`INSERT OR IGNORE INTO ${table} (${cols}) SELECT ${cols} FROM src.${table}`);
  }
  db.exec(`INSERT OR IGNORE INTO model_calls (id, job_id, story_id, character_id, purpose, attempt, model, provider,
      prompt_version, started_at, latency_ms, outcome, error_code, error_message, finish_reason, input_tokens,
      output_tokens, reasoning_tokens, cost_usd, cost_source, request_json, response_text)
    SELECT id, job_id, story_id, character_id, purpose, attempt, model, provider, prompt_version, started_at, latency_ms,
           outcome, error_code, error_message, finish_reason, input_tokens, output_tokens, reasoning_tokens, cost_usd,
           cost_source, '{}', NULL
      FROM src.model_calls`);
  db.exec('COMMIT');
  db.exec('DETACH DATABASE src');
}
db.exec("UPDATE jobs SET status = 'interrupted' WHERE status IN ('queued', 'running')");
db.exec('VACUUM');
const stories = db.prepare(`SELECT c.id AS character, s.chapter_count AS chapters FROM stories s JOIN characters c ON c.id = s.character_id ORDER BY c.sort_key, s.chapter_count`).all();
db.close();
fs.rmSync(`${target}-wal`, { force: true });
fs.rmSync(`${target}-shm`, { force: true });
console.log(`写入 ${path.relative(ROOT, target)}（${(fs.statSync(target).size / 1024).toFixed(0)} KB）`, stories);
