import { DatabaseSync } from 'node:sqlite';

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

function grams(text: string, n = 4): Set<string> {
  const chars = [...text.replace(/\s+/g, '')];
  const out = new Set<string>();
  for (let i = 0; i + n <= chars.length; i++) out.add(chars.slice(i, i + n).join(''));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export interface StoryMetrics {
  storyId: string;
  chapters: number;
  bodyChars: { min: number; avg: number; max: number };
  jobs: Record<string, number>;
  jobsNeedingRetry: number;
  calls: { chapter: Record<string, number>; arc: Record<string, number> };
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  tokens: { input: number; output: number; reasoning: number };
  costUsd: { total: number; reported: number; estimated: number; unknownCalls: number };
  context: { maxTokens: number; avgTokens: number };
  repetition: {
    /** Share of chapters with a beat tag already used in the previous 15 chapters. */
    beatTagRepeatRate: number;
    duplicateTitles: string[];
    /** Character 4-gram Jaccard similarity between consecutive chapters. */
    consecutiveSimilarity: { avg: number; max: number; maxAt: number | null };
  };
  memory: Record<string, number>;
  traitChanges: number;
  arcSummaries: number;
  directionChapters: number;
}

/** Engineering metrics that can be computed automatically (story quality still needs reading). */
export function storyMetrics(dbPath: string, storyId: string): StoryMetrics {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const chapters = db
      .prepare('SELECT number, title, body, beat_tags, direction_id FROM chapters WHERE story_id = ? ORDER BY number')
      .all(storyId) as { number: number; title: string; body: string; beat_tags: string; direction_id: string | null }[];
    const lengths = chapters.map((c) => [...c.body].length);
    const jobs = db.prepare('SELECT status, attempts, context_stats FROM jobs WHERE story_id = ?').all(storyId) as {
      status: string;
      attempts: number;
      context_stats: string | null;
    }[];
    const calls = db
      .prepare('SELECT purpose, outcome, latency_ms, input_tokens, output_tokens, reasoning_tokens, cost_usd, cost_source FROM model_calls WHERE story_id = ?')
      .all(storyId) as {
      purpose: string;
      outcome: string;
      latency_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      reasoning_tokens: number | null;
      cost_usd: number | null;
      cost_source: string;
    }[];
    const memories = db.prepare('SELECT kind, status FROM memories WHERE story_id = ?').all(storyId) as { kind: string; status: string }[];
    const traits = db.prepare('SELECT COUNT(*) AS n FROM trait_changes WHERE story_id = ?').get(storyId) as { n: number };
    const arcs = db.prepare('SELECT COUNT(*) AS n FROM arc_summaries WHERE story_id = ?').get(storyId) as { n: number };

    const count = <T>(xs: T[], key: (x: T) => string) =>
      xs.reduce<Record<string, number>>((acc, x) => ((acc[key(x)] = (acc[key(x)] ?? 0) + 1), acc), {});

    let repeated = 0;
    const tags = chapters.map((c) => JSON.parse(c.beat_tags) as string[]);
    tags.forEach((t, i) => {
      const window = new Set(tags.slice(Math.max(0, i - 15), i).flat());
      if (t.some((x) => window.has(x))) repeated++;
    });
    const titleCounts = count(chapters, (c) => c.title);
    const sims = chapters.slice(1).map((c, i) => jaccard(grams(chapters[i]!.body), grams(c.body)));
    const maxSim = sims.length ? Math.max(...sims) : 0;
    const chapterLatencies = calls.filter((c) => c.purpose === 'chapter' && c.outcome !== 'error').map((c) => c.latency_ms);
    const contexts = jobs.flatMap((j) => (j.context_stats ? [JSON.parse(j.context_stats).totalTokens as number] : []));
    const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

    return {
      storyId,
      chapters: chapters.length,
      bodyChars: {
        min: lengths.length ? Math.min(...lengths) : 0,
        avg: lengths.length ? Math.round(sum(lengths) / lengths.length) : 0,
        max: lengths.length ? Math.max(...lengths) : 0,
      },
      jobs: count(jobs, (j) => j.status),
      jobsNeedingRetry: jobs.filter((j) => j.attempts > 1).length,
      calls: {
        chapter: count(calls.filter((c) => c.purpose === 'chapter'), (c) => c.outcome),
        arc: count(calls.filter((c) => c.purpose === 'arc_summary'), (c) => c.outcome),
      },
      latencyMs: { p50: percentile(chapterLatencies, 50), p95: percentile(chapterLatencies, 95), max: chapterLatencies.length ? Math.max(...chapterLatencies) : null },
      tokens: { input: sum(calls.map((c) => c.input_tokens)), output: sum(calls.map((c) => c.output_tokens)), reasoning: sum(calls.map((c) => c.reasoning_tokens)) },
      costUsd: {
        total: Number(sum(calls.map((c) => c.cost_usd)).toFixed(5)),
        reported: Number(sum(calls.filter((c) => c.cost_source === 'reported').map((c) => c.cost_usd)).toFixed(5)),
        estimated: Number(sum(calls.filter((c) => c.cost_source === 'estimated').map((c) => c.cost_usd)).toFixed(5)),
        unknownCalls: calls.filter((c) => c.cost_source === 'unknown').length,
      },
      context: { maxTokens: contexts.length ? Math.max(...contexts) : 0, avgTokens: contexts.length ? Math.round(sum(contexts) / contexts.length) : 0 },
      repetition: {
        beatTagRepeatRate: chapters.length ? Number((repeated / chapters.length).toFixed(3)) : 0,
        duplicateTitles: Object.entries(titleCounts).filter(([, n]) => n > 1).map(([t]) => t),
        consecutiveSimilarity: {
          avg: sims.length ? Number((sum(sims) / sims.length).toFixed(3)) : 0,
          max: Number(maxSim.toFixed(3)),
          maxAt: sims.length ? sims.indexOf(maxSim) + 2 : null,
        },
      },
      memory: count(memories, (m) => `${m.kind}:${m.status}`),
      traitChanges: traits.n,
      arcSummaries: arcs.n,
      directionChapters: chapters.filter((c) => c.direction_id).length,
    };
  } finally {
    db.close();
  }
}
