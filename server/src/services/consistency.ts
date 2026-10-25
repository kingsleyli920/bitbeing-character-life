import { type ChapterDraft, type ConsistencyIssue, consistencyReportSchema } from '@cl/shared';
import type { ContextData } from './context-builder.js';

const SUMMARY_LIMIT = 15;
const PEOPLE_LIMIT = 30;
const RESOLVED_LIMIT = 20;

/**
 * The user message for the consistency reviewer (SPEC §2.7): what is already established, the
 * previous chapter in full, and the new draft. Built from the same data as the chapter context.
 */
export function consistencyPrompt(data: ContextData, draft: ChapterDraft): string {
  const people = data.memories
    .filter((m) => m.kind === 'person' && m.status !== 'resolved')
    .sort((a, b) => b.lastChapter - a.lastChapter)
    .slice(0, PEOPLE_LIMIT);
  const open = data.memories.filter((m) => m.status === 'open' || (m.kind !== 'person' && m.status === 'active' && m.importance >= 2));
  const resolved = data.memories
    .filter((m) => m.status === 'resolved')
    .sort((a, b) => b.lastChapter - a.lastChapter)
    .slice(0, RESOLVED_LIMIT);
  const line = (m: (typeof data.memories)[number]) => `- ${m.key}：${m.content}（第${m.sourceChapters.slice(-3).join('、')}章）`;
  const parts = [
    '【已知事实】',
    data.state ? `上一章结束时：${data.state.time}，${data.state.location}；${data.state.situation}` : '',
    `前情摘要：\n${data.chapterDigests
      .slice(-SUMMARY_LIMIT)
      .map((d) => `- 第${d.number}章${d.storyDate ? `（${d.storyDate}）` : ''}《${d.title}》：${d.summary}`)
      .join('\n')}`,
    people.length ? `人物：\n${people.map(line).join('\n')}` : '',
    open.length ? `进行中的事：\n${open.map(line).join('\n')}` : '',
    resolved.length ? `已经有结果的事：\n${resolved.map(line).join('\n')}` : '',
    data.previousChapter ? `【上一章原文】\n第${data.previousChapter.number}章《${data.previousChapter.title}》\n${data.previousChapter.body}` : '',
    `【新章节】\n第${data.chapterNumber}章《${draft.title}》 ${draft.storyDate} · ${draft.storyTime} · ${draft.location}\n${draft.body}`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

const normalize = (s: string) => s.replace(/[\s“”‘’"'「」『』]/g, '');

export type ConsistencyResult =
  | { ok: true; hard: ConsistencyIssue[]; soft: ConsistencyIssue[]; dropped: number }
  | { ok: false; message: string };

/** Validates the reviewer's output and drops issues whose quote is not actually in the chapter. */
export function parseConsistencyReport(text: string, body: string): ConsistencyResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: '一致性检查的输出不是合法的 JSON' };
  }
  const parsed = consistencyReportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: '一致性检查的输出不符合约定' };
  const haystack = normalize(body);
  const real = parsed.data.issues.filter((i) => haystack.includes(normalize(i.quote)));
  return {
    ok: true,
    hard: real.filter((i) => i.severity === 'hard'),
    soft: real.filter((i) => i.severity === 'soft'),
    dropped: parsed.data.issues.length - real.length,
  };
}

export function describeIssues(issues: ConsistencyIssue[]): string {
  return issues.map((i) => `- 「${i.quote}」：${i.conflict}`).join('\n');
}
