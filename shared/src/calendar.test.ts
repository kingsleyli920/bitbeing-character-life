import { describe, expect, it } from 'vitest';
import { addDays, calendarLookup, daysBetween, formatStoryDate, weekdayMentioned, weekdayOf } from './calendar.js';

describe('story calendar', () => {
  it('computes weekdays and day differences in UTC regardless of the host time zone', () => {
    expect(weekdayOf('2026-10-25')).toBe('星期日');
    expect(weekdayOf('2026-10-26')).toBe('星期一');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2026-03-01', '2026-02-27')).toBe(-2);
  });

  it('formats a date for prompts and the reader', () => {
    expect(formatStoryDate('2026-06-07')).toBe('2026年6月7日 星期日');
  });

  it('lists the dates the next chapter is likely to start on', () => {
    const lines = calendarLookup('2026-06-13');
    expect(lines).toContain('当天：2026-06-13 星期六');
    expect(lines).toContain('1 天后：2026-06-14 星期日');
    expect(lines).toContain('7 天后：2026-06-20 星期六');
    expect(lines.at(-1)).toBe('60 天后：2026-08-12 星期三');
  });

  it('finds the weekday a text names, if any', () => {
    expect(weekdayMentioned('周三傍晚')).toBe('星期三');
    expect(weekdayMentioned('星期天上午')).toBe('星期日');
    expect(weekdayMentioned('礼拜六夜里')).toBe('星期六');
    expect(weekdayMentioned('梅雨季的一个傍晚')).toBeNull();
    // "周年" and "周末" are not weekdays.
    expect(weekdayMentioned('开店三周年')).toBeNull();
    expect(weekdayMentioned('周末午后')).toBeNull();
  });
});
