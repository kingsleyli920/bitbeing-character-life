import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp, json } from '../helpers/app.js';
import { ScriptedProvider } from '../helpers/scripted-provider.js';

async function writeChapters(app: Awaited<ReturnType<typeof createTestApp>>['app'], storyId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const res = await json<{ job: { id: string } }>(app, 'POST', `/api/stories/${storyId}/jobs`, { requestId: randomUUID() });
    expect(res.status).toBe(202);
    await app.generation.idle();
  }
}

describe('long stories', () => {
  it('T9: at chapter 101 the prompt stays within budget and still lists every open thread', async () => {
    const provider = new ScriptedProvider();
    // Each chapter opens a thread and meets a new person; every 4th chapter resolves the oldest thread.
    provider.draftFor = (req) => {
      const n = req.trace.chapterNumber;
      const oldest = req.trace.knownKeys.find((k) => k.startsWith('线索'));
      return {
        title: `第${n}章`,
        beatTags: [`桥段${n}`],
        summary: `第${n}章：遇见了人物${n}，留下线索${n}。${'细节'.repeat(20)}`,
        memoryOps: [
          { op: 'upsert', kind: 'person', key: `人物${n}`, content: `第${n}章出现的人。${'背景'.repeat(30)}`, importance: (n % 3) + 1, status: 'active' },
          { op: 'upsert', kind: 'thread', key: `线索${n}`, content: `第${n}章留下的悬念。${'说明'.repeat(30)}`, importance: 2, status: 'open' },
          ...(n % 4 === 0 && oldest ? [{ op: 'resolve' as const, kind: 'thread' as const, key: oldest, content: '解决了', importance: 2, status: 'resolved' as const }] : []),
        ],
      };
    };
    const t = await createTestApp({ provider, sleep: vi.fn(async () => undefined) });
    const story = (await json<{ id: string }>(t.app, 'POST', '/api/characters/zhou-ye/stories', {})).body;
    await writeChapters(t.app, story.id, 101);

    const counts = t.db.prepare(`SELECT COUNT(*) AS n, SUM(status = 'succeeded') AS ok FROM jobs WHERE story_id = ?`).get(story.id);
    expect(counts).toEqual({ n: 101, ok: 101 });
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chapters WHERE story_id = ?').get(story.id)).toEqual({ n: 101 });
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM arc_summaries WHERE story_id = ?').get(story.id)).toEqual({ n: 10 });
    expect(provider.arcCalls).toHaveLength(10);

    const stats = (t.db.prepare('SELECT context_stats FROM jobs WHERE story_id = ? ORDER BY target_chapter').all(story.id) as { context_stats: string }[])
      .map((r) => JSON.parse(r.context_stats) as { totalTokens: number; budgetTokens: number });
    expect(Math.max(...stats.map((s) => s.totalTokens))).toBeLessThanOrEqual(12_000);

    const open = (t.db.prepare(`SELECT key FROM memories WHERE story_id = ? AND status = 'open'`).all(story.id) as { key: string }[]).map((r) => r.key);
    expect(open.length).toBeGreaterThan(50);
    const lastPrompt = provider.calls.at(-1)!.user;
    expect(lastPrompt).toContain('请写第 101 章');
    for (const key of open.filter((k) => Number(k.slice(2)) <= 100)) expect(lastPrompt).toContain(key);
    expect(lastPrompt).toContain('第91–100章');
    await t.app.close();
  }, 120_000);

  it('falls back to stitched summaries when an arc summary fails, and retries it on the next chapter', async () => {
    const provider = new ScriptedProvider();
    provider.pushArc({ kind: 'error', code: 'MODEL_UNAVAILABLE' });
    const t = await createTestApp({ provider, sleep: vi.fn(async () => undefined) });
    const story = (await json<{ id: string }>(t.app, 'POST', '/api/characters/lin-wan/stories', {})).body;
    await writeChapters(t.app, story.id, 11);

    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chapters WHERE story_id = ?').get(story.id)).toEqual({ n: 11 });
    expect(provider.calls[10]!.user).toContain('（自动拼接）');
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM arc_summaries WHERE story_id = ?').get(story.id)).toEqual({ n: 0 });

    await writeChapters(t.app, story.id, 1);
    expect(provider.arcCalls).toHaveLength(2);
    expect(t.db.prepare('SELECT from_chapter, to_chapter FROM arc_summaries WHERE story_id = ?').all(story.id)).toEqual([{ from_chapter: 1, to_chapter: 10 }]);
    expect(provider.calls[11]!.user).not.toContain('（自动拼接）');
    expect(t.db.prepare(`SELECT purpose, outcome FROM model_calls WHERE story_id = ? AND purpose = 'arc_summary' ORDER BY started_at`).all(story.id)).toEqual([
      { purpose: 'arc_summary', outcome: 'error' },
      { purpose: 'arc_summary', outcome: 'ok' },
    ]);
    await t.app.close();
  });
});

describe('arc summary soft limit', () => {
  it('clips an over-long arc summary instead of discarding it', async () => {
    const provider = new ScriptedProvider();
    provider.pushArc({ kind: 'text', text: JSON.stringify({ summary: '卷'.repeat(330) }) });
    const t = await createTestApp({ provider, sleep: vi.fn(async () => undefined) });
    const story = (await json<{ id: string }>(t.app, 'POST', '/api/characters/lin-wan/stories', {})).body;
    await writeChapters(t.app, story.id, 11);
    const arc = t.db.prepare('SELECT summary FROM arc_summaries WHERE story_id = ?').get(story.id) as { summary: string };
    expect([...arc.summary]).toHaveLength(300);
    expect(provider.arcCalls).toHaveLength(1);
    await t.app.close();
  });
});
