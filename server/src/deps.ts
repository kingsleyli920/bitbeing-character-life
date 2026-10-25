import type { AppConfig } from './config.js';
import type { Db } from './db/open.js';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  /** Current time as an ISO string (injectable for deterministic tests). */
  now: () => string;
}
