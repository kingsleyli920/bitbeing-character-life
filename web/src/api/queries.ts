import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export const POLL_MS = 1500;

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: api.getMeta });

export const useCharacters = () => useQuery({ queryKey: ['characters'], queryFn: api.listCharacters });

/** Story detail; polls while a job is queued or running so progress and completion show up. */
export const useStory = (storyId: string) =>
  useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.getStory(storyId),
    refetchInterval: (q) => (q.state.data?.activeJob ? POLL_MS : false),
  });

export const useMemory = (storyId: string, version: number | undefined) =>
  useQuery({
    queryKey: ['memory', storyId, version],
    queryFn: () => api.getMemory(storyId),
    enabled: version !== undefined,
  });

export const useToc = (storyId: string, total: number, enabled: boolean) =>
  useQuery({ queryKey: ['toc', storyId, total], queryFn: () => api.getToc(storyId), enabled });
