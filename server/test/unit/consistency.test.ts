import type { CharacterCard } from '@cl/shared';
import { describe, expect, it } from 'vitest';
import type { ContextData } from '../../src/services/context-builder.js';
import { consistencyPrompt, describeIssues, parseConsistencyReport } from '../../src/services/consistency.js';
import { makeDraft } from '../helpers/drafts.js';

const card: CharacterCard = { name: '陈一帆', background: '硬件创业者，正在准备众筹。'.repeat(3), narrativeStyle: 'novel' };

const data: ContextData = {
  chapterNumber: 6,
  card,
  profile: [],
  state: { time: '周五夜', location: '深圳', situation: '众筹上线前一周', goals: ['做完用户访谈'], mood: '紧绷' },
  direction: null,
  memories: [
    { kind: 'person', key: '母亲', content: '住在潮州，发来一条语音，第 3 章陈一帆终于听了', importance: 2, status: 'active', sourceChapters: [1, 3], firstChapter: 1, lastChapter: 3 },
    { kind: 'thread', key: '护眼宣传', content: '宣传语可能违规', importance: 3, status: 'open', sourceChapters: [2], firstChapter: 2, lastChapter: 4 },
    { kind: 'promise', key: '回电话', content: '答应周末给母亲回电话；第 4 章已经回了', importance: 1, status: 'resolved', sourceChapters: [1, 4], firstChapter: 1, lastChapter: 4 },
  ],
  traitChanges: [],
  arcSummaries: [],
  previousChapter: { number: 5, title: '访谈', body: '上一章的正文：陈一帆在会议室里听用户抱怨屏幕太亮。' },
  chapterDigests: [1, 2, 3, 4, 5].map((n) => ({
    number: n,
    title: `标题${n}`,
    summary: n === 3 ? '陈一帆终于点开母亲的语音，听完后沉默了很久。' : `第${n}章的摘要。`,
    beatTags: [],
    daysSincePrevious: 1,
    storyDate: `2026-10-0${n}`,
    lifeAreas: ['工作学业'],
    checkedArea: null,
  })),
  excerpt: () => null,
};

describe('consistencyPrompt', () => {
  it('lists the known facts, the previous chapter and the new chapter', () => {
    const draft = makeDraft({ body: `${'新章节的正文。'.repeat(80)}她还是没有点开母亲的语音。` });
    const prompt = consistencyPrompt(data, draft);
    expect(prompt).toContain('【已知事实】');
    expect(prompt).toContain('第3章（2026-10-03）《标题3》：陈一帆终于点开母亲的语音');
    expect(prompt).toContain('母亲：住在潮州');
    // Resolved promises are facts too ("already called back").
    expect(prompt).toContain('回电话：答应周末给母亲回电话；第 4 章已经回了');
    expect(prompt).toContain('【上一章原文】');
    // Every earlier summary, not just the recent ones.
    const long = consistencyPrompt({ ...data, chapterNumber: 41, chapterDigests: Array.from({ length: 40 }, (_, i) => ({ ...data.chapterDigests[0]!, number: i + 1, summary: `第${i + 1}章的事` })) }, draft);
    expect(long).toContain('- 第1章（2026-10-01）《标题1》：第1章的事');
    expect(long).toContain('第40章的事');
    expect(prompt).toMatch(/【新章节】\n第6章《雨夜的鼓点》 2026-10-14 · 十月第二个周三，夜 · 成都，春熙路后巷\n/);
    expect(prompt).toContain('她还是没有点开母亲的语音。');
  });
});

describe('parseConsistencyReport', () => {
  const body = '她把手机扣在桌上。她还是没有点开母亲的语音。窗外下着雨。';
  const issue = (quote: string, severity: 'hard' | 'soft' = 'hard') => ({ quote, conflict: '第 3 章已经听过这条语音', chapter: 3, severity });

  it('keeps issues whose quote is really in the chapter, ignoring spacing and quote marks', () => {
    const report = { issues: [issue('“她还是没有点开 母亲的语音”'), issue('窗外下着雨', 'soft')], mainArea: '家人' };
    expect(parseConsistencyReport(JSON.stringify(report), body)).toEqual({
      ok: true,
      mainArea: '家人',
      hard: [report.issues[0]],
      soft: [report.issues[1]],
      dropped: 0,
    });
  });

  it('drops issues that quote text the chapter does not contain', () => {
    const result = parseConsistencyReport(JSON.stringify({ issues: [issue('她第一次见到母亲')], mainArea: '家人' }), body);
    expect(result).toMatchObject({ ok: true, hard: [], dropped: 1 });
  });

  it('reports output that is not a valid report', () => {
    expect(parseConsistencyReport('没有发现问题', body)).toMatchObject({ ok: false });
    expect(parseConsistencyReport(JSON.stringify({ issues: [{ quote: 'x' }] }), body)).toMatchObject({ ok: false });
  });
});

describe('describeIssues', () => {
  it('formats issues for the rewrite hint and job warnings', () => {
    expect(describeIssues([{ quote: '她还是没有点开母亲的语音', conflict: '第 3 章已经听过', chapter: 3, severity: 'hard' }])).toBe(
      '- 「她还是没有点开母亲的语音」：第 3 章已经听过',
    );
  });
});
