import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { ErrorBox, Loading } from '../components/QueryState';

/** `/characters/:id` → the character's latest story (created on first visit). */
export function OpenCharacter() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const open = useMutation({ mutationFn: () => api.openStory(id, { reuseLatest: true }) });

  useEffect(() => {
    open.mutate(undefined, { onSuccess: (story) => navigate(`/stories/${story.id}`, { replace: true }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="page">
      {open.isError ? (
        <ErrorBox error={open.error} title="打不开这个角色" onRetry={() => open.mutate(undefined, { onSuccess: (s) => navigate(`/stories/${s.id}`, { replace: true }) })} />
      ) : (
        <Loading label="正在翻开故事…" />
      )}
    </div>
  );
}
