import type { StoryDetail } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { errorText } from './QueryState';

const day = (iso: string) => iso.slice(0, 10);

/** 目录 / 导出 / timelines, folded into one small menu next to the panel title. */
export function StoryMenu({ story, onOpenToc }: { story: StoryDetail; onOpenToc: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const create = useMutation({
    mutationFn: () => api.openStory(story.characterId, { reuseLatest: false }),
    onSuccess: (s) => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['characters'] });
      navigate(`/stories/${s.id}`);
    },
  });
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn btn-ghost btn-small" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        更多
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={story.chapterCount === 0}
            onClick={() => {
              setOpen(false);
              onOpenToc();
            }}
          >
            目录
          </button>
          {story.chapterCount > 0 ? (
            <a role="menuitem" className="menu-item" href={api.exportUrl(story.id)} download onClick={() => setOpen(false)}>
              导出全文（Markdown）
            </a>
          ) : (
            <button type="button" role="menuitem" className="menu-item" disabled>
              导出全文（Markdown）
            </button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? '创建中…' : '开始一个新故事'}
          </button>
          {create.isError && <p className="field-error">{errorText(create.error)}</p>}
          {story.otherStories.length > 0 && (
            <>
              <p className="menu-caption">同一角色的其他故事</p>
              {story.otherStories.map((s) => (
                <Link key={s.id} role="menuitem" className="menu-item" to={`/stories/${s.id}`} onClick={() => setOpen(false)}>
                  {day(s.createdAt)} 开始 · {s.chapterCount} 段
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
