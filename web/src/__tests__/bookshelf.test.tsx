import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/msw';
import { renderApp } from '../test/render';

describe('Bookshelf', () => {
  it('lists characters with their style and reading progress', async () => {
    renderApp('/');
    expect(await screen.findByRole('link', { name: '林晚，还没有开始' })).toHaveAttribute('href', '/characters/lin-wan');
    expect(screen.getByRole('link', { name: '宋知微，读到第 12 章' })).toBeInTheDocument();
    expect(screen.getByText('日记')).toBeInTheDocument();
    expect(screen.getByText('还没有导入角色')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/characters', () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ code: 'INTERNAL', message: '服务器内部错误' }, { status: 500 })
          : HttpResponse.json({ characters: [] });
      }),
    );
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByText('服务器内部错误')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('还没有导入角色')).toBeInTheDocument();
  });
});
