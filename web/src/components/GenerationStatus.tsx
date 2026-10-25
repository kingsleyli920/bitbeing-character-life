import { JOB_ERROR_MESSAGES, type Job } from '@cl/shared';
import { useNow } from '../hooks/useNow';
import { errorText } from './QueryState';

export function elapsedSeconds(job: Job, now: number): number {
  const since = Date.parse(job.startedAt ?? job.createdAt);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** Progress of the active job, or the failure of the last job if it did not produce a chapter. */
export function GenerationStatus({
  activeJob,
  lastJob,
  chapterCount,
  requestError,
  onRetry,
}: {
  activeJob: Job | null;
  lastJob: Job | null;
  chapterCount: number;
  requestError: unknown;
  onRetry: () => void;
}) {
  const now = useNow(Boolean(activeJob));
  if (activeJob) {
    return (
      <div className="gen-status gen-running" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>
          正在写第 {activeJob.targetChapter} 章 · 已等待 {elapsedSeconds(activeJob, now)} 秒
          {activeJob.attempts > 1 && `（第 ${activeJob.attempts} 次尝试）`}
        </span>
      </div>
    );
  }
  if (requestError) {
    return (
      <div className="gen-status gen-failed" role="alert">
        <p className="state-title">请求没有发出去</p>
        <p className="state-detail">{errorText(requestError)}</p>
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          重试
        </button>
      </div>
    );
  }
  const unfinished = lastJob && lastJob.targetChapter > chapterCount && ['failed', 'interrupted', 'stale'].includes(lastJob.status);
  if (unfinished && lastJob) {
    return (
      <div className="gen-status gen-failed" role="alert">
        <p className="state-title">
          第 {lastJob.targetChapter} 章没有写成：{lastJob.errorCode ? JOB_ERROR_MESSAGES[lastJob.errorCode] : '生成失败'}
        </p>
        {lastJob.errorMessage && <p className="state-detail">{lastJob.errorMessage}</p>}
        <p className="muted small">已有章节和记忆没有受影响。尝试了 {lastJob.attempts} 次。</p>
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          重试
        </button>
      </div>
    );
  }
  return null;
}
