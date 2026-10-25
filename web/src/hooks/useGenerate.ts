import type { Job, StoryDetail } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { ApiError, api } from '../api/client';

const newRequestId = () => crypto.randomUUID();

/**
 * Starts a generation job. One click = one requestId; network retries reuse it (SPEC §3.1), and a
 * second click while a request is in flight is ignored, so double clicks send one POST.
 */
export function useGenerate(storyId: string, onJob?: (job: Job) => void) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const onJobRef = useRef(onJob);
  onJobRef.current = onJob;

  // Show the job as active right away, before the story refetch, so the button stays disabled.
  const track = (job: Job) => {
    if (job.status === 'queued' || job.status === 'running') {
      queryClient.setQueryData<StoryDetail>(['story', storyId], (old) => (old ? { ...old, activeJob: job } : old));
    }
    onJobRef.current?.(job);
  };

  // Lifecycle callbacks live on the mutation itself (not on `mutate`), so they always run and the
  // in-flight guard is always released.
  const mutation = useMutation({
    mutationFn: (requestId: string) => api.createJob(storyId, requestId),
    retry: (count, err) => count < 2 && err instanceof ApiError && err.code === 'NETWORK',
    retryDelay: 800,
    onSuccess: ({ job }) => track(job),
    onError: (err) => {
      const body = err instanceof ApiError ? (err.body as { job?: Job } | undefined) : undefined;
      if (body?.job) track(body.job);
    },
    onSettled: () => {
      inFlight.current = false;
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });

  const { mutate, reset } = mutation;
  const start = useCallback(() => {
    // The cache check closes the gap between "request settled" and "button re-rendered as disabled".
    const cached = queryClient.getQueryData<StoryDetail>(['story', storyId]);
    if (inFlight.current || cached?.activeJob) return;
    inFlight.current = true;
    reset();
    mutate(newRequestId());
  }, [mutate, queryClient, reset, storyId]);

  const conflict = mutation.error instanceof ApiError && mutation.error.code === 'JOB_IN_PROGRESS';
  return {
    start,
    isStarting: mutation.isPending,
    /** A request error other than "a job is already running" (which is shown as that job's progress). */
    error: conflict ? null : mutation.error,
  };
}
