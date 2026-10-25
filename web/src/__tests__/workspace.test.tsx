import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { installStoryBackend } from '../test/fakeBackend';
import { makeChapter, makeJob, makeStory, STORY_ID } from '../test/fixtures';
import { presetSummaries, server } from '../test/msw';
import { renderApp } from '../test/render';

const open = () => renderApp(`/stories/${STORY_ID}`);
const storyPanel = () => screen.getByRole('region', { name: '角色生活故事' });
const infoPanel = () => screen.getByRole('region', { name: '角色卡信息' });

afterEach(() => localStorage.clear());

describe('Workspace layout (reference design)', () => {
  it('shows the card on the left and the story on the right with their actions', async () => {
    installStoryBackend({ chapters: [makeChapter(1), makeChapter(2)] });
    open();
    expect(await screen.findByRole('heading', { name: '角色卡信息' })).toBeInTheDocument();
    expect(within(infoPanel()).getByRole('button', { name: '导入角色' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '角色生活故事' })).toBeInTheDocument();
    expect(within(storyPanel()).getByRole('button', { name: '故事走向' })).toBeInTheDocument();
    expect(await within(storyPanel()).findByText('生活故事序列 2')).toBeInTheDocument();
    expect(within(storyPanel()).getByRole('button', { name: '点击继续生成' })).toBeEnabled();
  });

  it('lists card fields and marks inferred and imagined ones', async () => {
    installStoryBackend();
    open();
    const list = await screen.findByRole('list', { name: '周野的角色卡' });
    expect(within(list).getByText('手头不宽裕')).toBeInTheDocument();
    expect(within(list).getByText('[推理]')).toHaveAttribute('title', '每月还父亲一万八');
    expect(within(list).getByText('[想象]')).toBeInTheDocument();
    expect(within(list).getByText(/成都外卖骑手，地下乐队/)).toBeInTheDocument();
  });

  it('switches characters with the chips and remembers the last one', async () => {
    installStoryBackend();
    open();
    const switcher = await screen.findByRole('navigation', { name: '切换角色' });
    expect(within(switcher).getByRole('link', { name: '周野，读到第 3 段' })).toHaveAttribute('aria-current', 'true');
    expect(within(switcher).getByRole('link', { name: '林晚，还没有开始' })).toHaveAttribute('href', '/characters/lin-wan');
    await waitFor(() => expect(localStorage.getItem('character-life:last-character')).toBe('zhou-ye'));
  });

  it('opens the remembered character from the home page', async () => {
    localStorage.setItem('character-life:last-character', 'zhou-ye');
    let opened = '';
    server.use(
      http.post('/api/characters/:id/stories', ({ params }) => {
        opened = String(params.id);
        return HttpResponse.json({ code: 'STOP', message: 'stop' }, { status: 500 });
      }),
    );
    renderApp('/');
    await waitFor(() => expect(opened).toBe('zhou-ye'));
  });
});

describe('Generating segments', () => {
  it('starts the story, shows progress, then the first segment', async () => {
    const backend = installStoryBackend();
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('周野的生活故事还没有开始')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '点击开始生成' }));
    expect(await screen.findByText(/正在写第 1 段/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在生成第 1 段…' })).toBeDisabled();
    expect(backend.posts).toHaveLength(1);

    backend.finishJob();
    expect(await screen.findByRole('heading', { name: '第1章的标题' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('生活故事序列 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '点击继续生成' })).toBeEnabled();
  });

  it('sends one request for a double click', async () => {
    const backend = installStoryBackend({ chapters: [makeChapter(1)] });
    const user = userEvent.setup();
    open();
    await user.dblClick(await screen.findByRole('button', { name: '点击继续生成' }));
    await screen.findByText(/正在写第 2 段/);
    expect(backend.posts).toHaveLength(1);
  });

  it('waits for the profile before the first segment', async () => {
    installStoryBackend({ story: { profile: { status: 'pending', profile: null, error: null } } });
    open();
    expect(await screen.findByText('正在补全角色设定，完成后即可开始。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '点击开始生成' })).toBeDisabled();
    expect(within(infoPanel()).getByText(/正在根据角色卡补全设定/)).toBeInTheDocument();
  });

  it('offers to retry a failed profile', async () => {
    installStoryBackend({ story: { profile: { status: 'failed', profile: null, error: '模型服务暂不可用' } } });
    let retried = 0;
    server.use(
      http.post('/api/characters/zhou-ye/profile', () => {
        retried++;
        return HttpResponse.json({ status: 'pending', profile: null, error: null }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('补全设定失败：模型服务暂不可用')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新补全' }));
    await waitFor(() => expect(retried).toBe(1));
  });

  it('shows why a segment failed and retries with a new request', async () => {
    const backend = installStoryBackend({
      chapters: [makeChapter(1)],
      story: { lastJob: makeJob({ status: 'failed', targetChapter: 2, attempts: 3, errorCode: 'MODEL_RATE_LIMITED', errorMessage: '模型服务繁忙：429' }) },
    });
    const user = userEvent.setup();
    open();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/第 2 段没有写成：模型服务繁忙/)).toBeInTheDocument();
    expect(within(alert).getByText(/尝试了 3 次/)).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: '重试' }));
    await screen.findByText(/正在写第 2 段/);
    expect(backend.posts).toHaveLength(1);
  });

  it('explains an interrupted job after a server restart', async () => {
    installStoryBackend({ story: { lastJob: makeJob({ status: 'interrupted', targetChapter: 1, errorCode: 'SERVER_RESTART', errorMessage: '服务重启，本次生成已中断' }) } });
    open();
    expect(await screen.findByText(/第 1 段没有写成：服务重启，本次生成已中断/)).toBeInTheDocument();
  });

  it('resumes showing progress for a job that was running when the page loaded', async () => {
    const backend = installStoryBackend({ story: { activeJob: makeJob({ targetChapter: 1 }) } });
    open();
    expect(await screen.findByText(/正在写第 1 段/)).toBeInTheDocument();
    expect(backend.posts).toHaveLength(0);
  });
});

describe('Story direction', () => {
  it('uses the reference hint and examples, then sets, shows and clears a direction', async () => {
    const backend = installStoryBackend({ chapters: [makeChapter(1)] });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '故事走向' }));
    const pop = screen.getByRole('dialog', { name: '故事走向' });
    expect(pop).toHaveTextContent('通过输入文字控制故事的走向，比方说“更悲惨一点”');
    expect(within(pop).getByText(/从第 2 段开始生效/)).toBeInTheDocument();

    const box = within(pop).getByLabelText('故事走向');
    await user.type(box, '好');
    await user.click(within(pop).getByRole('button', { name: '保存走向' }));
    expect(within(pop).getByText('走向至少 2 个字')).toBeInTheDocument();
    expect(backend.directionCalls).toEqual([]);

    await user.clear(box);
    await user.click(within(pop).getByRole('button', { name: '更多的感情故事' }));
    await user.click(within(pop).getByRole('button', { name: '保存走向' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '故事走向' })).not.toBeInTheDocument());
    expect(backend.directionCalls).toEqual([{ method: 'PUT', text: '更多的感情故事' }]);
    expect(await screen.findByTitle('更多的感情故事')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '故事走向' }));
    await user.click(screen.getByRole('button', { name: '清除当前走向' }));
    await waitFor(() => expect(screen.queryByTitle('更多的感情故事')).not.toBeInTheDocument());
    expect(backend.directionCalls.at(-1)).toEqual({ method: 'DELETE' });
  });

  it('closes on Escape', async () => {
    installStoryBackend();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '故事走向' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '故事走向' })).not.toBeInTheDocument();
  });

  it('warns that a direction changed mid-generation applies from the next segment', async () => {
    installStoryBackend({ chapters: [makeChapter(1)], story: { activeJob: makeJob({ targetChapter: 2 }) } });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '故事走向' }));
    expect(screen.getByText('第 2 段正在按原来的走向生成；新走向从第 3 段开始生效。')).toBeInTheDocument();
  });
});

describe('Navigating long stories', () => {
  it('opens a long story at the newest segment', async () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      installStoryBackend({ chapters: Array.from({ length: 13 }, (_, i) => makeChapter(i + 1)) });
      open();
      await screen.findByRole('heading', { name: '第13章的标题' });
      await waitFor(() => expect(scrolled).toEqual(['chapter-13']));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('loads earlier segments on demand', async () => {
    const backend = installStoryBackend({ chapters: Array.from({ length: 13 }, (_, i) => makeChapter(i + 1)) });
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole('heading', { name: '第13章的标题' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '第3章的标题' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '加载更早的段落' }));
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
    expect(backend.chapterQueries.at(-1)).toBe('?from=1&limit=3');
  });

  it('jumps from a memory source to an older segment', async () => {
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
    await user.click(await screen.findByRole('button', { name: '跳到第 1 段' }));
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
  });

  it('jumps from the table of contents in the 更多 menu', async () => {
    installStoryBackend({ chapters: Array.from({ length: 12 }, (_, i) => makeChapter(i + 1)) });
    server.use(
      http.get(`/api/stories/${STORY_ID}/toc`, () =>
        HttpResponse.json({ items: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, title: `第${i + 1}章的标题`, storyTime: `第${i + 1}天` })) }),
      ),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '更多' }));
    await user.click(screen.getByRole('menuitem', { name: '目录' }));
    const toc = screen.getByRole('dialog', { name: '目录 · 共 12 段' });
    await user.click(await within(toc).findByRole('button', { name: /第 1 段\s*第1章的标题/ }));
    expect(await screen.findByRole('heading', { name: '第1章的标题' })).toBeInTheDocument();
  });

  it('offers export and a new story in the 更多 menu', async () => {
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
    await user.click(await screen.findByRole('button', { name: '更多' }));
    expect(screen.getByRole('menuitem', { name: '导出全文（Markdown）' })).toHaveAttribute('href', `/api/stories/${STORY_ID}/export.md`);
    await user.click(screen.getByRole('menuitem', { name: '开始一个新故事' }));
    await waitFor(() => expect(created).toBe(1));
  });

  it('shows an error page for an unknown story', async () => {
    server.use(http.get(`/api/stories/${STORY_ID}`, () => HttpResponse.json({ code: 'NOT_FOUND', message: '故事不存在' }, { status: 404 })));
    open();
    expect(await screen.findByText('打不开这个故事')).toBeInTheDocument();
    expect(screen.getByText('故事不存在')).toBeInTheDocument();
  });
});

describe('Imported characters', () => {
  it('can be deleted from the workspace after an inline confirmation', async () => {
    const imported = { id: 'imp-1', source: 'import' as const, name: '程雨', identity: null, age: null, narrativeStyle: 'novel' as const, tagline: '大理咖啡馆', latestStory: null };
    installStoryBackend({ story: makeStory({ characterId: 'imp-1', card: { name: '程雨', background: '二十六岁，在大理开了一家只有六个座位的咖啡馆，之前在北京做广告。', narrativeStyle: 'novel' } }) });
    let deleted = 0;
    server.use(
      http.get('/api/characters', () => HttpResponse.json({ characters: [...presetSummaries, imported] })),
      http.delete('/api/characters/imp-1', () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('/api/characters/:id/stories', () => HttpResponse.json({ code: 'STOP', message: 'stop' }, { status: 500 })),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: '删除这个导入的角色' }));
    expect(deleted).toBe(0);
    await user.click(within(screen.getByRole('group', { name: '确认删除程雨' })).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(deleted).toBe(1));
  });
});
