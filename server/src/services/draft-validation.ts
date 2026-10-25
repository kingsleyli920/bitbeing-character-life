import { type ChapterDraft, chapterDraftSchema } from '@cl/shared';

export type DraftResult = { ok: true; draft: ChapterDraft } | { ok: false; message: string };

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1]! : trimmed;
}

/** Hard validation of one model response (SPEC §2.2). Any failure discards the whole chapter. */
export function parseDraft(text: string, ctx: { chapterNumber: number; hasDirection: boolean }): DraftResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    return { ok: false, message: '输出不是合法的 JSON' };
  }
  const parsed = chapterDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`)
      .join('; ');
    return { ok: false, message: `输出不符合约定：${detail}` };
  }
  const draft = parsed.data;
  for (const change of draft.traitChanges) {
    const bad = change.causeChapters.filter((c) => c < 1 || c > ctx.chapterNumber);
    if (bad.length) return { ok: false, message: `性格变化的起因章节不存在：${bad.join('、')}` };
  }
  if (ctx.hasDirection && !draft.directionHandling) {
    return { ok: false, message: '有故事走向时 directionHandling 不能为空' };
  }
  return { ok: true, draft: ctx.hasDirection ? draft : { ...draft, directionHandling: null } };
}
