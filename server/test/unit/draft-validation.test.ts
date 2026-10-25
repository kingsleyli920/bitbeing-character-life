import { describe, expect, it } from 'vitest';
import { parseDraft } from '../../src/services/draft-validation.js';
import { makeDraft } from '../helpers/drafts.js';

const ctx = { chapterNumber: 3, hasDirection: false };

describe('parseDraft', () => {
  it('accepts a valid draft', () => {
    expect(parseDraft(JSON.stringify(makeDraft()), ctx)).toMatchObject({ ok: true, draft: { title: '雨夜的鼓点' } });
  });

  it('rejects text that is not JSON', () => {
    expect(parseDraft('好的，下面是第三章：', ctx)).toMatchObject({ ok: false, message: expect.stringContaining('JSON') });
  });

  it('accepts JSON wrapped in a markdown fence', () => {
    expect(parseDraft('```json\n' + JSON.stringify(makeDraft()) + '\n```', ctx).ok).toBe(true);
  });

  it('rejects a schema violation and names the field', () => {
    const result = parseDraft(JSON.stringify(makeDraft({ body: '太短' })), ctx);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('body') });
  });

  it('rejects a trait change that cites a future or zero chapter', () => {
    const trait = (causeChapters: number[]) =>
      makeDraft({ traitChanges: [{ trait: '胆量', from: '怯', to: '敢', causeChapters, explanation: '被逼到墙角' }] });
    expect(parseDraft(JSON.stringify(trait([2, 3])), ctx).ok).toBe(true);
    expect(parseDraft(JSON.stringify(trait([4])), ctx)).toMatchObject({ ok: false, message: expect.stringContaining('起因章节') });
    expect(parseDraft(JSON.stringify(trait([0])), ctx).ok).toBe(false);
  });

  it('requires directionHandling when a direction is active', () => {
    expect(parseDraft(JSON.stringify(makeDraft()), { ...ctx, hasDirection: true })).toMatchObject({
      ok: false,
      message: expect.stringContaining('directionHandling'),
    });
  });

  it('drops directionHandling when no direction is active', () => {
    const draft = makeDraft({ directionHandling: { applied: true, how: '多余的说明', adjustments: null } });
    expect(parseDraft(JSON.stringify(draft), ctx)).toMatchObject({ ok: true, draft: { directionHandling: null } });
  });
});

describe('parseDraft soft limits', () => {
  it('clips over-long summary, title, beat tags, state and memory text with warnings instead of failing', () => {
    const draft = makeDraft({
      title: '标'.repeat(30),
      summary: '摘'.repeat(300),
      beatTags: ['一个超过十二个字的桥段标签写得太长了'],
      state: { ...makeDraft().state, situation: '处'.repeat(260) },
      memoryOps: [{ op: 'upsert', kind: 'event', key: '大事', content: '容'.repeat(350), importance: 2, status: 'active' }],
    });
    const result = parseDraft(JSON.stringify(draft), ctx);
    if (!result.ok) throw new Error(result.message);
    expect(result.draft.summary).toHaveLength(240);
    expect(result.draft.title.length).toBeLessThanOrEqual(24);
    expect(result.draft.beatTags[0]!.length).toBeLessThanOrEqual(12);
    expect(result.draft.state.situation).toHaveLength(200);
    expect(result.draft.memoryOps[0]!.content).toHaveLength(300);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('summary'), expect.stringContaining('title'), expect.stringContaining('memoryOps.0.content')]),
    );
  });

  it('still rejects a body that is too long, because clipping would cut the story', () => {
    expect(parseDraft(JSON.stringify(makeDraft({ body: '长'.repeat(3001) })), ctx).ok).toBe(false);
  });

  it('still rejects an over-long memory key, because keys identify entries', () => {
    const draft = makeDraft({ memoryOps: [{ op: 'upsert', kind: 'person', key: '键'.repeat(41), content: 'x', importance: 1, status: 'active' }] });
    expect(parseDraft(JSON.stringify(draft), ctx).ok).toBe(false);
  });
});
