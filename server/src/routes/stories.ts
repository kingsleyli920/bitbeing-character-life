import type { StoryDetail } from '@cl/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-errors.js';
import { getStory } from '../repos/stories.js';
import { buildStoryDetail } from '../services/story-view.js';

type StoryParams = { Params: { id: string } };

export function storyRoutes(app: FastifyInstance, { db }: AppDeps): void {
  app.get<StoryParams>('/api/stories/:id', async (req): Promise<StoryDetail> => {
    const story = getStory(db, req.params.id);
    if (!story) throw notFound('故事');
    return buildStoryDetail(db, story);
  });
}
