import { type ChapterDraft, chapterDraftSchema, daysBetween, weekdayMentioned, weekdayOf } from '@cl/shared';

export type DraftResult =
  | { ok: true; draft: ChapterDraft; warnings: string[]; daysSincePrevious: number }
  | { ok: false; message: string };

export interface DraftContext {
  chapterNumber: number;
  hasDirection: boolean;
  /** Start date of the previous chapter; null for chapter 1 and chapters written before dates existed. */
  previousDate?: string | null;
  /** Everything the model was shown; English words that appear here may be reused. */
  referenceText?: string;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1]! : trimmed;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Soft limits (SPEC §2.2): over-long descriptive text is clipped with a warning instead of
 * discarding the whole chapter. The body and memory keys are never clipped.
 */
function clipSoftLimits(raw: unknown, warnings: string[]): unknown {
  if (!isObj(raw)) return raw;
  const clip = (obj: Obj, key: string, max: number, path: string) => {
    const v = obj[key];
    if (typeof v === 'string' && [...v.trim()].length > max) {
      obj[key] = [...v.trim()].slice(0, max).join('');
      warnings.push(`${path} 超过 ${max} 字，已截断`);
    }
  };
  const cap = (obj: Obj, key: string, max: number, path: string) => {
    const v = obj[key];
    if (Array.isArray(v) && v.length > max) {
      obj[key] = v.slice(0, max);
      warnings.push(`${path} 超过 ${max} 项，已截断`);
    }
  };
  const d = { ...raw };
  clip(d, 'title', 24, 'title');
  clip(d, 'storyTime', 60, 'storyTime');
  clip(d, 'location', 60, 'location');
  clip(d, 'summary', 240, 'summary');
  cap(d, 'beatTags', 4, 'beatTags');
  if (Array.isArray(d.beatTags)) {
    d.beatTags = d.beatTags.map((t, i) => {
      const holder: Obj = { t };
      clip(holder, 't', 12, `beatTags.${i}`);
      return holder.t;
    });
  }
  if (isObj(d.state)) {
    const s = { ...d.state };
    clip(s, 'time', 60, 'state.time');
    clip(s, 'location', 60, 'state.location');
    clip(s, 'situation', 200, 'state.situation');
    clip(s, 'mood', 40, 'state.mood');
    cap(s, 'goals', 4, 'state.goals');
    if (Array.isArray(s.goals)) {
      s.goals = s.goals.map((g, i) => {
        const holder: Obj = { g };
        clip(holder, 'g', 80, `state.goals.${i}`);
        return holder.g;
      });
    }
    d.state = s;
  }
  cap(d, 'memoryOps', 12, 'memoryOps');
  if (Array.isArray(d.memoryOps)) {
    d.memoryOps = d.memoryOps.map((op, i) => {
      if (!isObj(op)) return op;
      const o = { ...op };
      clip(o, 'content', 300, `memoryOps.${i}.content`);
      return o;
    });
  }
  cap(d, 'traitChanges', 1, 'traitChanges');
  if (Array.isArray(d.traitChanges)) {
    d.traitChanges = d.traitChanges.map((t, i) => {
      if (!isObj(t)) return t;
      const o = { ...t };
      clip(o, 'trait', 30, `traitChanges.${i}.trait`);
      clip(o, 'from', 80, `traitChanges.${i}.from`);
      clip(o, 'to', 80, `traitChanges.${i}.to`);
      clip(o, 'explanation', 200, `traitChanges.${i}.explanation`);
      return o;
    });
  }
  if (isObj(d.directionHandling)) {
    const h = { ...d.directionHandling };
    clip(h, 'how', 300, 'directionHandling.how');
    clip(h, 'adjustments', 300, 'directionHandling.adjustments');
    d.directionHandling = h;
  }
  return d;
}

const LATIN_WORD = /[A-Za-z][A-Za-z'-]{2,}/g;

/**
 * Short Chinese fields must not drift into English ("answer" in a summary, SPEC §2.2). A Latin word
 * is allowed if the chapter body or the context already uses it (names, "livehouse", "Wi-Fi").
 */
function strayEnglish(draft: ChapterDraft, referenceText: string): string | null {
  const known = new Set(`${referenceText}\n${draft.body}`.match(LATIN_WORD)?.map((w) => w.toLowerCase()) ?? []);
  const fields: [string, string][] = [
    ['title', draft.title],
    ['summary', draft.summary],
    ...draft.beatTags.map((t, i): [string, string] => [`beatTags.${i}`, t]),
    ['state.situation', draft.state.situation],
    ['state.mood', draft.state.mood],
    ...draft.state.goals.map((g, i): [string, string] => [`state.goals.${i}`, g]),
    ...draft.memoryOps.flatMap((m, i): [string, string][] => [
      [`memoryOps.${i}.key`, m.key],
      [`memoryOps.${i}.content`, m.content],
    ]),
  ];
  for (const [path, value] of fields) {
    const word = value.match(LATIN_WORD)?.find((w) => !known.has(w.toLowerCase()));
    if (word) return `${path} 里混入了英文词“${word}”，请改用中文`;
  }
  return null;
}

/** Validates one model response (SPEC §2.2). Hard failures discard the whole chapter. */
export function parseDraft(text: string, ctx: DraftContext): DraftResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    return { ok: false, message: '输出不是合法的 JSON' };
  }
  const warnings: string[] = [];
  const parsed = chapterDraftSchema.safeParse(clipSoftLimits(raw, warnings));
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
  const previousDate = ctx.previousDate ?? null;
  const days = previousDate ? daysBetween(previousDate, draft.storyDate) : 0;
  if (days < 0) {
    return { ok: false, message: `storyDate ${draft.storyDate} 早于上一章的日期 ${previousDate}，时间不能倒流` };
  }
  const named = weekdayMentioned(draft.storyTime);
  const actual = weekdayOf(draft.storyDate);
  if (named && named !== actual) {
    return { ok: false, message: `storyTime 写的是${named}，但 ${draft.storyDate} 是${actual}` };
  }
  const stray = strayEnglish(draft, ctx.referenceText ?? '');
  if (stray) return { ok: false, message: stray };
  return { ok: true, draft: ctx.hasDirection ? draft : { ...draft, directionHandling: null }, warnings, daysSincePrevious: days };
}
