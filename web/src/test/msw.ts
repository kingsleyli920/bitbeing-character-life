import type { CharacterSummary, MetaResponse } from '@cl/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const fixtureMeta: MetaResponse = {
  provider: 'fixture',
  model: 'fixture',
  modelConfigured: true,
  budget: { capUsd: 5, spentUsd: 0 },
};

export const presetSummaries: CharacterSummary[] = [
  { id: 'lin-wan', source: 'preset', name: '林晚', identity: '旧物修复师', age: '32 岁', narrativeStyle: 'novel', tagline: '在上海开旧物修复铺', latestStory: null },
  { id: 'song-zhiwei', source: 'preset', name: '宋知微', identity: '物理老师', age: '45 岁', narrativeStyle: 'diary', tagline: '县城中学的物理老师', latestStory: { id: 's-2', chapterCount: 12, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' } },
];

/** Default handlers; tests override per case with `server.use`. */
export const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(fixtureMeta)),
  http.get('/api/characters', () => HttpResponse.json({ characters: presetSummaries })),
);
