import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fixtureMeta, server } from '../test/msw';
import { renderApp } from '../test/render';

describe('App shell', () => {
  it('shows the fixture badge when the server runs the fake model', async () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: '角色人生' })).toBeInTheDocument();
    expect(await screen.findByText('Fixture 模式')).toBeInTheDocument();
  });

  it('shows spend and cap for the real model instead of the badge', async () => {
    server.use(
      http.get('/api/meta', () =>
        HttpResponse.json({ ...fixtureMeta, provider: 'openrouter', model: 'anthropic/claude-haiku-5.5', budget: { capUsd: 5, spentUsd: 0.0123 } }),
      ),
    );
    renderApp('/');
    expect(await screen.findByText('已用 $0.012 / $5')).toBeInTheDocument();
    expect(screen.queryByText('Fixture 模式')).not.toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/nope');
    expect(screen.getByText('页面不存在。')).toBeInTheDocument();
  });
});
