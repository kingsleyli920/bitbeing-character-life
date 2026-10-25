import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { installStoryBackend } from '../test/fakeBackend';
import { STORY_ID } from '../test/fixtures';
import { server } from '../test/msw';
import { renderApp } from '../test/render';

const imported = { id: 'imp-1', source: 'import', name: '程雨', identity: null, age: null, narrativeStyle: 'novel', tagline: '大理咖啡馆', latestStory: null };

function captureImports(response: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post('/api/characters/import', async ({ request }) => {
      bodies.push(await request.json());
      return response();
    }),
    http.post('/api/characters/imp-1/stories', () => HttpResponse.json({ code: 'X', message: 'stop here' }, { status: 500 })),
  );
  return bodies;
}

async function openDialog() {
  installStoryBackend();
  const user = userEvent.setup();
  renderApp(`/stories/${STORY_ID}`);
  await user.click(await screen.findByRole('button', { name: '导入角色' }));
  return { user, dialog: screen.getByRole('dialog', { name: '导入角色' }) };
}

describe('Import dialog', () => {
  it('validates a pasted description locally before sending', async () => {
    const bodies = captureImports(() => HttpResponse.json({ character: imported, warnings: [] }, { status: 201 }));
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/角色描述/), '太短');
    await user.click(within(dialog).getByRole('button', { name: '导入' }));
    expect(within(dialog).getByText('请填写姓名')).toBeInTheDocument();
    expect(within(dialog).getByText('描述至少 20 字')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('imports the text example and opens the new character', async () => {
    const bodies = captureImports(() => HttpResponse.json({ character: imported, warnings: [] }, { status: 201 }));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: '填入示例' }));
    await user.click(within(dialog).getByRole('button', { name: '导入' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bodies[0]).toMatchObject({ format: 'text', name: '程雨' });
    expect(await screen.findByText('打不开这个角色')).toBeInTheDocument(); // navigated to /characters/imp-1
  });

  it('lists JSON problems with readable field names', async () => {
    captureImports(() => HttpResponse.json({ character: imported, warnings: [] }, { status: 201 }));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('tab', { name: '自定义 JSON' }));
    const box = within(dialog).getByLabelText(/粘贴角色卡 JSON/);
    await user.click(box);
    await user.paste('{"name":"","relationships":[{"name":"","relation":"父亲"}]}');
    await user.click(within(dialog).getByRole('button', { name: '导入' }));
    const list = within(dialog).getByRole('alert', { name: '校验问题' });
    expect(list).toHaveTextContent('姓名：请填写姓名');
    expect(list).toHaveTextContent('背景：请填写背景');
    expect(list).toHaveTextContent('人际关系 · 第 1 条 · 姓名：请填写人物姓名');
  });

  it('shows server-side issues when the server rejects the card', async () => {
    captureImports(() =>
      HttpResponse.json({ code: 'VALIDATION', message: '角色卡校验未通过', issues: [{ path: 'name', message: '服务端：姓名重复' }] }, { status: 400 }),
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('tab', { name: '自定义 JSON' }));
    await user.click(within(dialog).getByRole('button', { name: '填入示例' }));
    await user.click(within(dialog).getByRole('button', { name: '导入' }));
    expect(await within(dialog).findByText(/服务端：姓名重复/)).toBeInTheDocument();
  });

  it('shows tavern import warnings before opening the character', async () => {
    captureImports(() =>
      HttpResponse.json({ character: imported, warnings: ['已忽略以下字段（不用于故事生成）：system_prompt'] }, { status: 201 }),
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('tab', { name: '酒馆卡 JSON' }));
    expect(within(dialog).getByText(/目前不支持 PNG 图片卡/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '填入示例' }));
    await user.click(within(dialog).getByRole('button', { name: '导入' }));
    const done = await screen.findByRole('dialog', { name: '导入成功' });
    expect(done).toHaveTextContent('system_prompt');
    expect(within(done).getByRole('button', { name: '开始阅读' })).toBeInTheDocument();
  });
});

