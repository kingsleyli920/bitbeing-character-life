import type { Chapter } from '@cl/shared';

/** Merges newly fetched chapters into the ones already loaded, keeping one per number, in order. */
export function mergeChapters(existing: readonly Chapter[], incoming: readonly Chapter[]): Chapter[] {
  const byNumber = new Map(existing.map((c) => [c.number, c]));
  for (const c of incoming) byNumber.set(c.number, c);
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** Chunks of at most `size` chapter numbers covering [from, to]. */
export function chunkRange(from: number, to: number, size: number): { from: number; limit: number }[] {
  const out: { from: number; limit: number }[] = [];
  for (let start = from; start <= to; start += size) out.push({ from: start, limit: Math.min(size, to - start + 1) });
  return out;
}
