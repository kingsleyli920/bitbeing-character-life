import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { fixtureMeta, server } from '../test/msw';

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('App shell', () => {
  it('shows the fixture badge when the server runs the fake model', async () => {
    render(<App queryClient={client()} />);
    expect(screen.getByRole('link', { name: '角色人生' })).toBeInTheDocument();
    expect(await screen.findByText('Fixture 模式')).toBeInTheDocument();
  });

  it('hides the badge for the real model', async () => {
    server.use(
      http.get('/api/meta', () =>
        HttpResponse.json({ ...fixtureMeta, provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }),
      ),
    );
    render(<App queryClient={client()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Fixture 模式')).not.toBeInTheDocument();
  });
});
