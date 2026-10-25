import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '出了点问题';
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry, title = '加载失败' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{title}</p>
      <p className="state-detail">{errorText(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}
