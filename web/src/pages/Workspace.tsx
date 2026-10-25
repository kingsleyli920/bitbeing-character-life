import type { StoryDetail } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { useCharacters, useStory } from '../api/queries';
import { ChapterView } from '../components/ChapterView';
import { CharacterInfo } from '../components/CharacterInfo';
import { CharacterSwitcher } from '../components/CharacterSwitcher';
import { DirectionPopover } from '../components/DirectionPopover';
import { GenerationStatus } from '../components/GenerationStatus';
import { ImportDialog } from '../components/ImportDialog';
import { MemoryPanel } from '../components/MemoryPanel';
import { Empty, ErrorBox, errorText, Loading } from '../components/QueryState';
import { StoryMenu } from '../components/StoryMenu';
import { TocDrawer } from '../components/TocDrawer';
import { useChapters } from '../hooks/useChapters';
import { useGenerate } from '../hooks/useGenerate';
import { forgetCharacter, rememberCharacter } from '../lib/storage';

function scrollToChapter(n: number) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() =>
    document.getElementById(`chapter-${n}`)?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
  );
}

function DeleteCharacter({ story }: { story: StoryDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteCharacter(story.characterId),
    onSuccess: () => {
      // Leave first and drop the deleted story's queries, so nothing refetches it (404).
      forgetCharacter(story.characterId);
      navigate('/', { replace: true });
      for (const key of ['story', 'memory', 'chapters', 'toc']) queryClient.removeQueries({ queryKey: [key, story.id] });
      void queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
  if (!confirming) {
    return (
      <button type="button" className="link-btn link-danger" onClick={() => setConfirming(true)}>
        删除这个导入的角色
      </button>
    );
  }
  return (
    <div className="delete-confirm" role="group" aria-label={`确认删除${story.card.name}`}>
      <span>删除角色和 TA 的所有故事？</span>
      <button type="button" className="btn btn-danger btn-small" onClick={() => remove.mutate()} disabled={remove.isPending}>
        确认删除
      </button>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>
        取消
      </button>
      {remove.isError && <span className="field-error">{errorText(remove.error)}</span>}
    </div>
  );
}

function WorkspaceBody({ story, characterSource }: { story: StoryDetail; characterSource: 'preset' | 'import' | undefined }) {
  const queryClient = useQueryClient();
  const [directionOpen, setDirectionOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const chapters = useChapters(story.id, story.chapterCount);
  const onJob = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['story', story.id] }), [queryClient, story.id]);
  const generate = useGenerate(story.id, onJob);
  const busy = Boolean(story.activeJob) || generate.isStarting;
  const waitingForProfile = story.chapterCount === 0 && story.profile.status === 'pending';

  useEffect(() => rememberCharacter(story.characterId), [story.characterId]);

  // After a segment this reader asked for arrives, bring it into view.
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
      setTocOpen(false);
      setInfoOpen(false);
      await chapters.ensureLoaded(n);
      scrollToChapter(n);
    },
    [chapters],
  );

  const buttonLabel = busy ? `正在生成第 ${story.activeJob?.targetChapter ?? story.chapterCount + 1} 段…` : story.chapterCount === 0 ? '点击开始生成' : '点击继续生成';

  return (
    <div className="workspace">
      <section className={`panel-box info-panel ${infoOpen ? 'info-open' : ''}`} aria-labelledby="info-title">
        <header className="panel-head">
          <h2 id="info-title">角色卡信息</h2>
          <button type="button" className="btn btn-outline btn-small info-toggle" onClick={() => setInfoOpen((o) => !o)} aria-expanded={infoOpen}>
            {infoOpen ? '收起' : '展开'}
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setImporting(true)}>
            导入角色
          </button>
        </header>
        <CharacterSwitcher activeId={story.characterId} />
        <div className="panel-scroll info-body">
          <CharacterInfo characterId={story.characterId} card={story.card} profile={story.profile} profileFrozen={story.profileFrozen} />
          <MemoryPanel storyId={story.id} version={story.version} onJump={(n) => void jumpTo(n)} />
          {characterSource === 'import' && <DeleteCharacter story={story} />}
        </div>
      </section>

      <section className="panel-box story-panel" aria-labelledby="story-title">
        <header className="panel-head">
          <h2 id="story-title">角色生活故事</h2>
          <span className="muted small">共 {story.chapterCount} 段</span>
          <span className="header-spacer" />
          {story.direction && (
            <button type="button" className="direction-chip" onClick={() => setDirectionOpen(true)} title={story.direction.text}>
              <span className="direction-label">走向</span>
              <span className="direction-text">{story.direction.text}</span>
            </button>
          )}
          <div className="popover-anchor">
            <button
              type="button"
              className="btn btn-outline btn-small"
              data-direction-toggle
              aria-expanded={directionOpen}
              onClick={() => setDirectionOpen((o) => !o)}
            >
              故事走向
            </button>
            {directionOpen && (
              <DirectionPopover
                storyId={story.id}
                current={story.direction}
                chapterCount={story.chapterCount}
                activeJob={story.activeJob}
                onClose={() => setDirectionOpen(false)}
              />
            )}
          </div>
          <StoryMenu story={story} onOpenToc={() => setTocOpen(true)} />
        </header>

        <div className="panel-scroll story-body">
          {story.chapterCount === 0 && !story.activeJob && (
            <Empty title={`${story.card.name}的生活故事还没有开始`}>
              <p className="muted">点下方「点击开始生成」写出第一段。之后每一段都会接着前面发生的事继续，可以随时用右上角的「故事走向」影响接下来的发展。</p>
            </Empty>
          )}
          {chapters.hasEarlier && (
            <div className="load-earlier">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void chapters.loadEarlier()} disabled={chapters.loadingEarlier}>
                {chapters.loadingEarlier ? '加载中…' : '加载更早的段落'}
              </button>
              {chapters.earlierError && <ErrorBox error={chapters.earlierError} onRetry={() => void chapters.loadEarlier()} />}
            </div>
          )}
          {chapters.isLoading && <Loading label="正在打开故事…" />}
          {chapters.error && <ErrorBox error={chapters.error} onRetry={chapters.retry} />}
          {chapters.chapters.map((c) => (
            <ChapterView key={c.number} chapter={c} />
          ))}
          <GenerationStatus
            activeJob={story.activeJob}
            lastJob={story.lastJob}
            chapterCount={story.chapterCount}
            requestError={generate.error}
            onRetry={generate.start}
          />
        </div>

        <footer className="panel-foot">
          {waitingForProfile && <span className="muted small">正在补全角色设定，完成后即可开始。</span>}
          <button type="button" className="btn btn-generate" onClick={generate.start} disabled={busy || waitingForProfile}>
            {buttonLabel}
          </button>
        </footer>
      </section>

      {tocOpen && <TocDrawer storyId={story.id} total={story.chapterCount} onJump={(n) => void jumpTo(n)} onClose={() => setTocOpen(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

export function Workspace() {
  const { id = '' } = useParams();
  const story = useStory(id);
  const characters = useCharacters();
  if (story.isPending) return <Loading label="正在打开故事…" />;
  if (story.isError) {
    return (
      <div className="page">
        <ErrorBox error={story.error} title="打不开这个故事" onRetry={() => void story.refetch()} />
        <a href="/">回到首页</a>
      </div>
    );
  }
  const source = characters.data?.characters.find((c) => c.id === story.data.characterId)?.source;
  return <WorkspaceBody key={story.data.id} story={story.data} characterSource={source} />;
}
