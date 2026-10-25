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

describe('parseDraft story calendar', () => {
  // makeDraft() starts on 2026-10-14, a Wednesday, and its storyTime says 周三.
  it('derives the days elapsed from the previous chapter date', () => {
    expect(parseDraft(JSON.stringify(makeDraft()), { ...ctx, previousDate: '2026-10-10' })).toMatchObject({ ok: true, daysSincePrevious: 4 });
    expect(parseDraft(JSON.stringify(makeDraft()), { ...ctx, previousDate: '2026-10-14' })).toMatchObject({ ok: true, daysSincePrevious: 0 });
  });

  it('counts zero days for the first chapter and for stories written before dates existed', () => {
    expect(parseDraft(JSON.stringify(makeDraft()), { ...ctx, previousDate: null })).toMatchObject({ ok: true, daysSincePrevious: 0 });
  });

  it('rejects a date earlier than the previous chapter', () => {
    expect(parseDraft(JSON.stringify(makeDraft()), { ...ctx, previousDate: '2026-10-15' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('storyDate'),
    });
  });

  it('rejects a storyTime whose weekday does not match the date', () => {
    const result = parseDraft(JSON.stringify(makeDraft({ storyTime: '周二夜里' })), ctx);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('星期三') });
  });
});

describe('parseDraft stray English words', () => {
  it('rejects an English word in the summary that the chapter never uses', () => {
    const draft = makeDraft({ summary: '周野终于 answer 了老曾的要求，答应明天中午前报出主唱的名字，可他心里一个人选都没有。' });
    expect(parseDraft(JSON.stringify(draft), ctx)).toMatchObject({ ok: false, message: expect.stringContaining('answer') });
  });

  it('allows English words that appear in the body or in the context the model was given', () => {
    const body = `${'雨下得很大，周野把电动车停在 livehouse 门口。'.repeat(30)}`;
    const inBody = makeDraft({ body, summary: '周野在 livehouse 门口被老曾限期报出主唱名字，否则专场取消。他找不到人选。' });
    expect(parseDraft(JSON.stringify(inBody), ctx).ok).toBe(true);
    const fromCard = makeDraft({ summary: '周野给 Mia 打电话，被老曾限期报出主唱名字，否则专场取消。他找不到人选。' });
    expect(parseDraft(JSON.stringify(fromCard), { ...ctx, referenceText: '前队友 Mia（贝斯手）' }).ok).toBe(true);
  });
});
