import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { installStoryBackend } from '../test/fakeBackend';
import { makeChapter, makeJob, STORY_ID } from '../test/fixtures';
import { server } from '../test/msw';
import { renderApp } from '../test/render';

const open = () => renderApp(`/stories/${STORY_ID}`);

describe('Reader', () => {
  it('starts a story, shows progress, then the first chapter', async () => {
    const backend = installStoryBackend();
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('周野的故事还没有开始')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始故事' }));

    expect(await screen.findByText(/正在写第 1 章/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在写…' })).toBeDisabled();
    expect(backend.posts).toHaveLength(1);

    backend.finishJob();
    expect(await screen.findByRole('heading', { name: '第1章的标题' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续故事' })).toBeEnabled();
    expect(screen.queryByText(/正在写第/)).not.toBeInTheDocument();
  });

  it('sends one request for a double click', async () => {
    const backend = installStoryBackend({ chapters: [makeChapter(1)] });
    const user = userEvent.setup();
    open();
    await user.dblClick(await screen.findByRole('button', { name: '继续故事' }));
    await screen.findByText(/正在写第 2 章/);
    expect(backend.posts).toHaveLength(1);
  });

  it('shows why the last chapter failed and retries with a new request', async () => {
    const backend = installStoryBackend({
      chapters: [makeChapter(1)],
      story: { lastJob: makeJob({ status: 'failed', targetChapter: 2, attempts: 3, errorCode: 'MODEL_RATE_LIMITED', errorMessage: '模型服务繁忙：429' }) },
    });
    const user = userEvent.setup();
    open();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/第 2 章没有写成：模型服务繁忙/)).toBeInTheDocument();
    expect(within(alert).getByText(/尝试了 3 次/)).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: '重试' }));
    await screen.findByText(/正在写第 2 章/);
    expect(backend.posts).toHaveLength(1);
  });

  it('explains an interrupted job after a server restart', async () => {
    installStoryBackend({
      story: { lastJob: makeJob({ status: 'interrupted', targetChapter: 1, errorCode: 'SERVER_RESTART', errorMessage: '服务重启，本次生成已中断' }) },
    });
    open();
    expect(await screen.findByText(/第 1 章没有写成：服务重启，本次生成已中断/)).toBeInTheDocument();
  });

  it('resumes showing progress for a job that was already running when the page loaded', async () => {
    const backend = installStoryBackend({ story: { activeJob: makeJob({ targetChapter: 1 }) } });
    open();
    expect(await screen.findByText(/正在写第 1 章/)).toBeInTheDocument();
    expect(backend.posts).toHaveLength(0);
  });

  it('sets, shows and clears a direction', async () => {
    const backend = installStoryBackend({ chapters: [makeChapter(1)] });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '调整走向' }));
    const dialog = screen.getByRole('dialog', { name: '调整故事走向' });
    expect(within(dialog).getByText(/从第 2 章开始生效/)).toBeInTheDocument();

    const box = within(dialog).getByLabelText('希望接下来发生什么？');
    await user.type(box, '好');
    await user.click(within(dialog).getByRole('button', { name: '保存走向' }));
    expect(within(dialog).getByText('走向至少 2 个字')).toBeInTheDocument();
    expect(backend.directionCalls).toEqual([]);

    await user.clear(box);
    await user.click(within(dialog).getByRole('button', { name: '让之前失联的朋友重新出现' }));
    await user.click(within(dialog).getByRole('button', { name: '保存走向' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backend.directionCalls).toEqual([{ method: 'PUT', text: '让之前失联的朋友重新出现' }]);
    expect(await screen.findByTitle('让之前失联的朋友重新出现')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '调整走向' }));
    await user.click(screen.getByRole('button', { name: '清除当前走向' }));
    await waitFor(() => expect(screen.getByText('未设置走向')).toBeInTheDocument());
    expect(backend.directionCalls.at(-1)).toEqual({ method: 'DELETE' });
  });

  it('warns that a direction changed mid-generation applies from the next chapter', async () => {
    installStoryBackend({ chapters: [makeChapter(1)], story: { activeJob: makeJob({ targetChapter: 2 }) } });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '调整走向' }));
    expect(screen.getByText('第 2 章正在按原来的走向生成；新走向从第 3 章开始生效。')).toBeInTheDocument();
  });

  it('loads earlier chapters on demand', async () => {
    const backend = installStoryBackend({ chapters: Array.from({ length: 13 }, (_, i) => makeChapter(i + 1)) });
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole('heading', { name: '第13章的标题' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '第3章的标题' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '加载更早的章节' }));
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
    expect(backend.chapterQueries.at(-1)).toBe('?from=1&limit=3');
    expect(screen.queryByRole('button', { name: '加载更早的章节' })).not.toBeInTheDocument();
  });

  it('jumps from a memory source to an older chapter', async () => {
    installStoryBackend({
      chapters: Array.from({ length: 12 }, (_, i) => makeChapter(i + 1)),
      memory: {
        items: [{ id: 'm1', kind: 'promise', key: '报主唱名字', content: '答应老曾', importance: 3, status: 'open', sourceChapters: [1], firstChapter: 1, lastChapter: 1 }],
        traitChanges: [],
        arcSummaries: [],
      },
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByText(/^记忆/));
    await user.click(await screen.findByRole('button', { name: '跳到第 1 章' }));
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
  });

  it('shows an error page for an unknown story', async () => {
    server.use(http.get(`/api/stories/${STORY_ID}`, () => HttpResponse.json({ code: 'NOT_FOUND', message: '故事不存在' }, { status: 404 })));
    open();
    expect(await screen.findByText('打不开这个故事')).toBeInTheDocument();
    expect(screen.getByText('故事不存在')).toBeInTheDocument();
  });
});

describe('Reader navigation', () => {
  it('jumps to a chapter from the table of contents', async () => {
    installStoryBackend({ chapters: Array.from({ length: 12 }, (_, i) => makeChapter(i + 1)) });
    server.use(
      http.get(`/api/stories/${STORY_ID}/toc`, () =>
        HttpResponse.json({ items: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, title: `第${i + 1}章的标题`, storyTime: `第${i + 1}天` })) }),
      ),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '目录' }));
    const toc = screen.getByRole('dialog', { name: '目录 · 共 12 章' });
    await user.click(await within(toc).findByRole('button', { name: /第 1 章\s*第1章的标题/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
  });

  it('offers export and starting a new story', async () => {
    installStoryBackend({ chapters: [makeChapter(1)] });
    let created = 0;
    server.use(
      http.post('/api/characters/zhou-ye/stories', () => {
        created++;
        return HttpResponse.json({ code: 'STOP', message: 'stop' }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole('link', { name: '导出' })).toHaveAttribute('href', `/api/stories/${STORY_ID}/export.md`);
    await user.click(screen.getByText('故事'));
    await user.click(screen.getByRole('button', { name: '开始一个新故事' }));
    await waitFor(() => expect(created).toBe(1));
  });
});
