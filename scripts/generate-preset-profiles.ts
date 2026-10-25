/**
 * Generates server/src/presets/<id>.profile.json with the real model, using the product's
 * ProfileService (same prompt, validation and call logging). Costs about $0.002 per character.
 *   npx tsx scripts/generate-preset-profiles.ts [id ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { providerFromConfig } from '../server/src/app.js';
import { loadConfig, loadEnvFile } from '../server/src/config.js';
import { openDb } from '../server/src/db/open.js';
import { PRESET_IDS, seedPresets } from '../server/src/presets/index.js';
import { getProfileState } from '../server/src/repos/profiles.js';
import { ProfileService } from '../server/src/services/profile.js';

loadEnvFile();
const config = loadConfig({ ...process.env, DB_PATH: ':memory:' }, []);
const provider = providerFromConfig(config);
if (!provider.configured) {
  console.error('需要 OPENROUTER_API_KEY');
  process.exit(1);
}
const db = openDb(':memory:');
const now = () => new Date().toISOString();
seedPresets(db, now(), { withProfiles: false });
const service = new ProfileService({ config, db, now, provider });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...PRESET_IDS];
for (const id of ids) service.start(id);
await service.idle();
for (const id of ids) {
  const state = getProfileState(db, id);
  if (state.status !== 'ready' || !state.profile) {
    console.error(`${id}: ${state.status} ${state.error ?? ''}`);
    continue;
  }
  const file = path.join(import.meta.dirname, '../server/src/presets', `${id}.profile.json`);
  fs.writeFileSync(file, `${JSON.stringify(state.profile, null, 2)}\n`);
  console.log(`${id}: ${state.profile.fields.length} 个字段 → ${path.relative(process.cwd(), file)}`);
}
const cost = db.prepare('SELECT SUM(cost_usd) AS c, COUNT(*) AS n FROM model_calls').get() as { c: number; n: number };
console.log(`调用 ${cost.n} 次，费用 $${(cost.c ?? 0).toFixed(4)}`);
