import { describe, expect, it } from 'vitest';
import { makeChapter } from '../test/fixtures';
import { chunkRange, mergeChapters } from './chapters';

describe('mergeChapters', () => {
  it('keeps one chapter per number, in order, and never drops loaded ones', () => {
    const merged = mergeChapters([makeChapter(11), makeChapter(12)], [makeChapter(12, { title: '新' }), makeChapter(13), makeChapter(3)]);
    expect(merged.map((c) => c.number)).toEqual([3, 11, 12, 13]);
    expect(merged[2]!.title).toBe('新');
  });
});

describe('chunkRange', () => {
  it('splits a range into pages', () => {
    expect(chunkRange(1, 45, 20)).toEqual([
      { from: 1, limit: 20 },
      { from: 21, limit: 20 },
      { from: 41, limit: 5 },
    ]);
    expect(chunkRange(5, 4, 20)).toEqual([]);
  });
});
