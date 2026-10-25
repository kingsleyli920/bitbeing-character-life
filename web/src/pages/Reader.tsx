import type { StoryDetail } from '@cl/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useStory } from '../api/queries';
import { ChapterView } from '../components/ChapterView';
import { CharacterPanel } from '../components/CharacterPanel';
import { DirectionDialog } from '../components/DirectionDialog';
import { GenerationStatus } from '../components/GenerationStatus';
import { MemoryPanel } from '../components/MemoryPanel';
import { Empty, ErrorBox, Loading } from '../components/QueryState';
import { useChapters } from '../hooks/useChapters';
import { useGenerate } from '../hooks/useGenerate';

function scrollToChapter(n: number) {
  requestAnimationFrame(() =>
    document.getElementById(`chapter-${n}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
  );
}

function ReaderBody({ story }: { story: StoryDetail }) {
  const queryClient = useQueryClient();
  const [directionOpen, setDirectionOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chapters = useChapters(story.id, story.chapterCount);
  const onJob = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['story', story.id] }), [queryClient, story.id]);
  const generate = useGenerate(story.id, onJob);
  const busy = Boolean(story.activeJob) || generate.isStarting;

  // After a chapter this reader asked for arrives, bring it into view.
  const expecting = useRef<number | null>(null);
  useEffect(() => {
    if (story.activeJob) expecting.current = story.activeJob.targetChapter;
  }, [story.activeJob]);
  useEffect(() => {
    const target = expecting.current;
    if (target && chapters.chapters.some((c) => c.number === target)) {
      expecting.current = null;
      scrollToChapter(target);
    }
  }, [chapters.chapters]);

  const jumpTo = useCallback(
    async (n: number) => {
      setSidebarOpen(false);
      await chapters.ensureLoaded(n);
      scrollToChapter(n);
    },
    [chapters],
  );

  const start = generate.start;

  return (
    <div className={`reader ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar" aria-label="角色与记忆">
        <CharacterPanel card={story.card} />
        <MemoryPanel storyId={story.id} version={story.version} onJump={(n) => void jumpTo(n)} />
      </aside>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="reading">
        <div className="story-head">
          <Link to="/" className="back-link">
            ← 书架
          </Link>
          <button type="button" className="btn btn-ghost sidebar-toggle" onClick={() => setSidebarOpen(true)}>
            角色与记忆
          </button>
          <span className="header-spacer" />
          <span className="muted small">共 {story.chapterCount} 章</span>
        </div>

        {story.chapterCount === 0 && !story.activeJob && (
          <Empty title={`${story.card.name}的故事还没有开始`}>
            <p className="muted">点「开始故事」写下第一章。之后每一章都会接着前面发生的事继续。</p>
          </Empty>
        )}

        {chapters.hasEarlier && (
          <div className="load-earlier">
            <button type="button" className="btn btn-ghost" onClick={() => void chapters.loadEarlier()} disabled={chapters.loadingEarlier}>
              {chapters.loadingEarlier ? '加载中…' : '加载更早的章节'}
            </button>
            {chapters.earlierError && <ErrorBox error={chapters.earlierError} onRetry={() => void chapters.loadEarlier()} />}
          </div>
        )}
        {chapters.isLoading && <Loading label="正在打开章节…" />}
        {chapters.error && <ErrorBox error={chapters.error} onRetry={chapters.retry} />}
        <div className="chapters">
          {chapters.chapters.map((c) => (
            <ChapterView key={c.number} chapter={c} />
          ))}
        </div>

        <GenerationStatus
          activeJob={story.activeJob}
          lastJob={story.lastJob}
          chapterCount={story.chapterCount}
          requestError={generate.error}
          onRetry={start}
        />
      </main>

      <div className="action-bar">
        <div className="action-bar-inner">
          {story.direction ? (
            <button type="button" className="direction-chip" onClick={() => setDirectionOpen(true)} title={story.direction.text}>
              <span className="direction-label">走向</span>
              <span className="direction-text">{story.direction.text}</span>
            </button>
          ) : (
            <span className="muted small">未设置走向</span>
          )}
          <span className="header-spacer" />
          <button type="button" className="btn btn-ghost" onClick={() => setDirectionOpen(true)}>
            调整走向
          </button>
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
            {busy ? '正在写…' : story.chapterCount === 0 ? '开始故事' : '继续故事'}
          </button>
        </div>
      </div>

      {directionOpen && (
        <DirectionDialog
          storyId={story.id}
          current={story.direction}
          chapterCount={story.chapterCount}
          activeJob={story.activeJob}
          onClose={() => setDirectionOpen(false)}
        />
      )}
    </div>
  );
}

export function Reader() {
  const { id = '' } = useParams();
  const story = useStory(id);
  if (story.isPending) return <Loading label="正在打开故事…" />;
  if (story.isError) {
    return (
      <div className="page">
        <ErrorBox error={story.error} title="打不开这个故事" onRetry={() => void story.refetch()} />
        <Link to="/">回到书架</Link>
      </div>
    );
  }
  return <ReaderBody key={story.data.id} story={story.data} />;
}
