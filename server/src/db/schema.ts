/** Schema version 1 (docs/SPEC.md §4.3). Bump `SCHEMA_VERSION` and add a migration step when changing it. */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('preset', 'import')),
  card_json TEXT NOT NULL,
  sort_key INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  card_snapshot TEXT NOT NULL,
  state TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  active_direction_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_by_character ON stories(character_id, updated_at);

CREATE TABLE IF NOT EXISTS directions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cleared_at TEXT,
  effective_from_chapter INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  story_time TEXT NOT NULL,
  location TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT NOT NULL,
  beat_tags TEXT NOT NULL,
  direction_id TEXT,
  direction_handling TEXT,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (story_id, number)
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'open', 'resolved')),
  source_chapters TEXT NOT NULL,
  first_chapter INTEGER NOT NULL,
  last_chapter INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (story_id, key)
);

CREATE TABLE IF NOT EXISTS trait_changes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  trait TEXT NOT NULL,
  from_text TEXT NOT NULL,
  to_text TEXT NOT NULL,
  cause_chapters TEXT NOT NULL,
  explanation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arc_summaries (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  from_chapter INTEGER NOT NULL,
  to_chapter INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (story_id, from_chapter)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'interrupted', 'stale')),
  base_version INTEGER NOT NULL,
  target_chapter INTEGER NOT NULL,
  direction_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  warnings TEXT,
  context_stats TEXT,
  chapter_id TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (story_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(story_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS jobs_by_story ON jobs(story_id, created_at);

CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('chapter', 'arc_summary')),
  attempt INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider TEXT,
  prompt_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  latency_ms INTEGER,
  outcome TEXT NOT NULL,
  error_code TEXT,
  finish_reason TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  cost_usd REAL,
  cost_source TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_text TEXT
);
CREATE INDEX IF NOT EXISTS model_calls_by_job ON model_calls(job_id);
`;
