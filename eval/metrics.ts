import { DatabaseSync } from 'node:sqlite';
import { daysBetween, weekdayMentioned, weekdayOf } from '@cl/shared';

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
  calls: { chapter: Record<string, number>; arc: Record<string, number>; consistency: Record<string, number> };
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
  /** Long-story pacing: are threads resolved, or do they hang forever? */
  pacing: {
    threadsResolved: number;
    threadsOpen: number;
    resolutionRate: number;
    oldestOpenThreadAge: number;
    arcsSayingUnresolved: number;
    distinctLocations: number;
    /** Sum of daysSincePrevious (null when chapters predate prompt v4). */
    storyDays: number | null;
  };
  /** Story calendar (prompt v5): null fields when chapters have no dates. */
  calendar: {
    firstDate: string | null;
    lastDate: string | null;
    /** Days from the first chapter's date to the last one's, inclusive. */
    spanDays: number | null;
    jumpsOver7Days: number;
    maxJumpDays: number;
    /** storyTime names a weekday that does not match the date. */
    weekdayMismatches: number;
  };
  /** Main life area (first of lifeAreas) per chapter (prompt v5). */
  lifeAreas: {
    main: Record<string, number>;
    topShare: number;
    /** Highest share of one main area in any 10 consecutive chapters. */
    maxWindowShare: number;
  };
  /** Consistency check (SPEC §2.7), from job warnings and rejected chapter calls. */
  consistency: {
    rewrites: number;
    hardIssuesFound: number;
    softWarnings: number;
    savedWithHardIssues: number;
  };
}

/** Engineering metrics that can be computed automatically (story quality still needs reading). */
export function storyMetrics(dbPath: string, storyId: string): StoryMetrics {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const chapters = db
      .prepare('SELECT * FROM chapters WHERE story_id = ? ORDER BY number')
      .all(storyId) as {
      number: number;
      title: string;
      body: string;
      beat_tags: string;
      direction_id: string | null;
      story_time: string;
      days_since_previous?: number | null;
      story_date?: string | null;
      life_areas?: string;
    }[];
    const lengths = chapters.map((c) => [...c.body].length);
    const jobs = db.prepare('SELECT status, attempts, context_stats, warnings FROM jobs WHERE story_id = ?').all(storyId) as {
      status: string;
      attempts: number;
      context_stats: string | null;
      warnings: string | null;
    }[];
    const calls = db
      .prepare('SELECT purpose, outcome, error_message, latency_ms, input_tokens, output_tokens, reasoning_tokens, cost_usd, cost_source FROM model_calls WHERE story_id = ?')
      .all(storyId) as {
      purpose: string;
      outcome: string;
      error_message: string | null;
      latency_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      reasoning_tokens: number | null;
      cost_usd: number | null;
      cost_source: string;
    }[];
    const memories = db.prepare('SELECT kind, status, first_chapter FROM memories WHERE story_id = ?').all(storyId) as { kind: string; status: string; first_chapter: number }[];
    const arcTexts = (db.prepare('SELECT summary FROM arc_summaries WHERE story_id = ?').all(storyId) as { summary: string }[]).map((a) => a.summary);
    const locations = new Set((db.prepare('SELECT location FROM chapters WHERE story_id = ?').all(storyId) as { location: string }[]).map((r) => r.location.split(/[，,、]/)[0]!.trim()));
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
        consistency: count(calls.filter((c) => c.purpose === 'consistency'), (c) => c.outcome),
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
      pacing: (() => {
        const tracked = memories.filter((m) => m.kind === 'thread' || m.kind === 'promise');
        const resolved = tracked.filter((m) => m.status === 'resolved').length;
        const openOnes = tracked.filter((m) => m.status === 'open');
        return {
          threadsResolved: resolved,
          threadsOpen: openOnes.length,
          resolutionRate: tracked.length ? Number((resolved / tracked.length).toFixed(2)) : 0,
          oldestOpenThreadAge: openOnes.length ? chapters.length - Math.min(...openOnes.map((m) => m.first_chapter)) : 0,
          arcsSayingUnresolved: arcTexts.filter((t) => /仍未|尚未|未确认|未被证实|均未/.test(t)).length,
          distinctLocations: locations.size,
          storyDays: chapters.every((c) => typeof c.days_since_previous === 'number') ? chapters.reduce((a, c) => a + (c.days_since_previous ?? 0), 0) : null,
        };
      })(),
      calendar: (() => {
        const dated = chapters.filter((c) => c.story_date);
        const first = dated[0]?.story_date ?? null;
        const last = dated.at(-1)?.story_date ?? null;
        const jumps = dated.slice(1).map((c, i) => daysBetween(dated[i]!.story_date!, c.story_date!));
        return {
          firstDate: first,
          lastDate: last,
          spanDays: first && last ? daysBetween(first, last) + 1 : null,
          jumpsOver7Days: jumps.filter((d) => d >= 7).length,
          maxJumpDays: jumps.length ? Math.max(...jumps) : 0,
          weekdayMismatches: dated.filter((c) => {
            const named = weekdayMentioned(c.story_time);
            return named !== null && named !== weekdayOf(c.story_date!);
          }).length,
        };
      })(),
      lifeAreas: (() => {
        const mains = chapters.map((c) => (JSON.parse(c.life_areas ?? '[]') as string[])[0]).filter((a): a is string => Boolean(a));
        const main = count(mains, (a) => a);
        const top = mains.length ? Math.max(...Object.values(main)) : 0;
        let maxWindow = 0;
        for (let i = 0; i + 10 <= mains.length; i++) {
          const w = count(mains.slice(i, i + 10), (a) => a);
          maxWindow = Math.max(maxWindow, ...Object.values(w));
        }
        return { main, topShare: mains.length ? Number((top / mains.length).toFixed(2)) : 0, maxWindowShare: maxWindow / 10 };
      })(),
      consistency: (() => {
        const rejected = calls.filter((c) => c.purpose === 'chapter' && c.error_message?.startsWith('一致性检查发现'));
        const warnings = jobs.flatMap((j) => (j.warnings ? (JSON.parse(j.warnings) as string[]) : []));
        return {
          rewrites: rejected.filter((c) => c.outcome === 'invalid').length,
          hardIssuesFound: rejected.reduce((n, c) => n + (c.error_message!.match(/^- 「/gm)?.length ?? 0), 0),
          softWarnings: warnings.filter((w) => w.startsWith('一致性检查（疑似）')).length,
          savedWithHardIssues: warnings.filter((w) => w.startsWith('一致性检查：')).length,
        };
      })(),
    };
  } finally {
    db.close();
  }
}
