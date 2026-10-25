import { DIRECTION_MAX, DIRECTION_MIN, type Direction, type Job } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { errorText } from './QueryState';

/** The examples from the assignment's reference design, then a few plot-level ones. */
export const DIRECTION_EXAMPLES = [
  '更悲惨一点',
  '故事更有冒险性一点',
  '故事更有哲理一点',
  '更多的感情故事',
  '让 TA 遇到一次事业挫折，但不要突然改变性格',
  '让之前失联的朋友重新出现',
];

export function validateDirection(text: string): string | null {
  const t = text.trim();
  if (t.length < DIRECTION_MIN) return `走向至少 ${DIRECTION_MIN} 个字`;
  if (t.length > DIRECTION_MAX) return `走向最多 ${DIRECTION_MAX} 字`;
  return null;
}

/** Anchored under the 故事走向 button, like the note in the reference design. */
export function DirectionPopover({
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
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(current?.text ?? '');
  const [touched, setTouched] = useState(false);
  const localError = validateDirection(text);
  const nextSegment = (activeJob ? activeJob.targetChapter : chapterCount) + 1;

  useEffect(() => {
    ref.current?.querySelector('textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && !(target as Element).closest?.('[data-direction-toggle]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    onClose();
  };
  const save = useMutation({ mutationFn: () => api.setDirection(storyId, text.trim()), onSuccess: done });
  const clear = useMutation({ mutationFn: () => api.clearDirection(storyId), onSuccess: done });

  return (
    <div className="popover direction-popover" role="dialog" aria-label="故事走向" ref={ref}>
      <p className="popover-hint">
        通过输入文字控制故事的走向，比方说“更悲惨一点”“故事更有冒险性一点”“故事更有哲理一点”“更多的感情故事”等等。
      </p>
      <form
        className="direction-form"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!localError) save.mutate();
        }}
      >
        <label htmlFor="direction-text" className="sr-only">
          故事走向
        </label>
        <textarea
          id="direction-text"
          value={text}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={touched && Boolean(localError)}
          aria-describedby="direction-hint"
          placeholder="希望接下来的故事怎么走？"
        />
        <div className="field-row">
          <span id="direction-hint" className={touched && localError ? 'field-error' : 'muted small'}>
            {touched && localError ? localError : `从第 ${nextSegment} 段开始生效，已经写好的段落不会改变。`}
          </span>
          <span className="muted small">
            {text.trim().length}/{DIRECTION_MAX}
          </span>
        </div>
        {activeJob && (
          <p className="notice">
            第 {activeJob.targetChapter} 段正在按原来的走向生成；新走向从第 {activeJob.targetChapter + 1} 段开始生效。
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
        <div className="popover-actions">
          {current && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => clear.mutate()} disabled={clear.isPending}>
              清除当前走向
            </button>
          )}
          <span className="header-spacer" />
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary btn-small" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存走向'}
          </button>
        </div>
      </form>
    </div>
  );
}
