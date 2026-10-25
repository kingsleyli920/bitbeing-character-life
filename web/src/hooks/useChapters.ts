import { CHAPTER_PAGE_MAX, type Chapter } from '@cl/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { chunkRange, mergeChapters } from './chapters';

export const PAGE_SIZE = 10;

/**
 * Loaded chapters of one story. The newest page is refetched whenever `total` grows; older pages
 * are fetched on demand and kept, so the list never develops gaps.
 */
export function useChapters(storyId: string, total: number) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<Error | null>(null);

  useEffect(() => setChapters([]), [storyId]);

  const latest = useQuery({
    queryKey: ['chapters', storyId, 'latest', total],
    queryFn: () => api.listChapters(storyId, { limit: PAGE_SIZE }),
    enabled: total > 0,
  });

  useEffect(() => {
    if (latest.data) setChapters((prev) => mergeChapters(prev, latest.data.chapters));
  }, [latest.data]);

  const first = chapters[0]?.number ?? total + 1;

  const loadRange = useCallback(
    async (from: number, to: number) => {
      setLoadingEarlier(true);
      setEarlierError(null);
      try {
        for (const page of chunkRange(from, to, CHAPTER_PAGE_MAX)) {
          const res = await api.listChapters(storyId, page);
          setChapters((prev) => mergeChapters(prev, res.chapters));
        }
      } catch (err) {
        setEarlierError(err as Error);
      } finally {
        setLoadingEarlier(false);
      }
    },
    [storyId],
  );

  const loadEarlier = useCallback(() => loadRange(Math.max(1, first - PAGE_SIZE), first - 1), [first, loadRange]);

  /** Makes sure chapter `n` (and everything after it) is loaded. */
  const ensureLoaded = useCallback(
    async (n: number) => {
      if (n < first) await loadRange(n, first - 1);
    },
    [first, loadRange],
  );

  return {
    chapters,
    isLoading: total > 0 && latest.isPending,
    error: latest.error,
    retry: () => void latest.refetch(),
    hasEarlier: first > 1 && chapters.length > 0,
    loadEarlier,
    loadingEarlier,
    earlierError,
    ensureLoaded,
  };
}
