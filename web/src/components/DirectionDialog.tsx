import { DIRECTION_MAX, DIRECTION_MIN, type Direction, type Job } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Modal } from './Modal';
import { errorText } from './QueryState';

export const DIRECTION_EXAMPLES = [
  '让 TA 遇到一次事业挫折，但不要突然改变性格',
  '接下来温暖一点，让 TA 慢慢与家人和解',
  '让之前失联的朋友重新出现',
];

export function validateDirection(text: string): string | null {
  const t = text.trim();
  if (t.length < DIRECTION_MIN) return `走向至少 ${DIRECTION_MIN} 个字`;
  if (t.length > DIRECTION_MAX) return `走向最多 ${DIRECTION_MAX} 字`;
  return null;
}

export function DirectionDialog({
  storyId,
  current,
  chapterCount,
  activeJob,
  onClose,
}: {
  storyId: string;
  current: Direction | null;
  chapterCount: number;
  activeJob: Job | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(current?.text ?? '');
  const [touched, setTouched] = useState(false);
  const localError = validateDirection(text);
  const nextChapter = (activeJob ? activeJob.targetChapter : chapterCount) + 1;

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    onClose();
  };
  const save = useMutation({ mutationFn: () => api.setDirection(storyId, text.trim()), onSuccess: done });
  const clear = useMutation({ mutationFn: () => api.clearDirection(storyId), onSuccess: done });

  return (
    <Modal title="调整故事走向" onClose={onClose}>
      <form
        className="direction-form"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!localError) save.mutate();
        }}
      >
        <label htmlFor="direction-text" className="field-label">
          希望接下来发生什么？
        </label>
        <textarea
          id="direction-text"
          value={text}
          rows={3}
          maxLength={DIRECTION_MAX + 50}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={touched && Boolean(localError)}
          aria-describedby="direction-hint"
          placeholder="例如：让之前失联的朋友重新出现"
        />
        <div className="field-row">
          <span id="direction-hint" className={touched && localError ? 'field-error' : 'muted small'}>
            {touched && localError ? localError : `从第 ${nextChapter} 章开始生效，已写好的章节不会改变。`}
          </span>
          <span className="muted small">
            {text.trim().length}/{DIRECTION_MAX}
          </span>
        </div>
        {activeJob && (
          <p className="notice">
            第 {activeJob.targetChapter} 章正在按原来的走向生成；新走向从第 {activeJob.targetChapter + 1} 章开始生效。
          </p>
        )}
        <div className="chips" aria-label="示例">
          {DIRECTION_EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        {(save.error || clear.error) && (
          <p className="field-error" role="alert">
            {errorText(save.error ?? clear.error)}
          </p>
        )}
        <div className="modal-actions">
          {current && (
            <button type="button" className="btn btn-ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
              清除当前走向
            </button>
          )}
          <span className="header-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存走向'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
