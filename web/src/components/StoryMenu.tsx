import type { StoryDetail } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { errorText } from './QueryState';

const day = (iso: string) => iso.slice(0, 10);

/** Other timelines of the same character, and starting a new one. */
export function StoryMenu({ story }: { story: StoryDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.openStory(story.characterId, { reuseLatest: false }),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: ['characters'] });
      navigate(`/stories/${s.id}`);
    },
  });
  return (
    <details className="menu">
      <summary className="btn btn-ghost">故事</summary>
      <div className="menu-panel">
        <p className="muted small">同一个角色可以有多条互不影响的时间线。</p>
        <button type="button" className="btn btn-ghost" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? '创建中…' : '开始一个新故事'}
        </button>
        {create.isError && <p className="field-error">{errorText(create.error)}</p>}
        {story.otherStories.length > 0 && (
          <ul className="plain-list menu-list">
            {story.otherStories.map((s) => (
              <li key={s.id}>
                <Link to={`/stories/${s.id}`}>
                  {day(s.createdAt)} 开始 · {s.chapterCount} 章
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
