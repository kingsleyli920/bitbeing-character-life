/**
 * The story calendar (SPEC §2.5), shared by the server (prompts, validation) and the reader. Each chapter states the date it starts on; the server derives the
 * days elapsed and every weekday from those dates, so the model never has to count days itself.
 */
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;
const DAY_MS = 86_400_000;
const LOOKUP_OFFSETS = [0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60];

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(toTime(date)).getUTCDay()]!;
}

export function addDays(date: string, days: number): string {
  return new Date(toTime(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

/** `2026年6月7日 星期日` */
export function formatStoryDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}年${m}月${d}日 ${weekdayOf(date)}`;
}

/** Candidate start dates for the next chapter, with their weekdays. */
export function calendarLookup(previousDate: string): string[] {
  return LOOKUP_OFFSETS.map((n) => {
    const date = addDays(previousDate, n);
    return `${n === 0 ? '当天' : `${n} 天后`}：${date} ${weekdayOf(date)}`;
  });
}

const WEEKDAY_RE = /(?:星期|礼拜|周)([一二三四五六日天])/;
const DIGIT_TO_WEEKDAY: Record<string, string> = { 一: '星期一', 二: '星期二', 三: '星期三', 四: '星期四', 五: '星期五', 六: '星期六', 日: '星期日', 天: '星期日' };

/** The weekday a short time label names (`周三傍晚` → `星期三`), or null. */
export function weekdayMentioned(text: string): string | null {
  const m = WEEKDAY_RE.exec(text);
  return m ? DIGIT_TO_WEEKDAY[m[1]!]! : null;
}
