import {
  chaptersQuerySchema,
  type ChaptersResponse,
  createJobRequestSchema,
  type JobResponse,
  type MemoryResponse,
  setDirectionRequestSchema,
  type StoryDetail,
  type TocResponse,
} from '@cl/shared';
import type { FastifyInstance } from 'fastify';
import { transaction } from '../db/open.js';
import type { AppDeps } from '../deps.js';
import { notFound, parseInput } from '../http-errors.js';
import { listChapters, listToc } from '../repos/chapters.js';
import { clearDirection, setDirection } from '../repos/directions.js';
import { getActiveJobRow, getJobRow, toJob } from '../repos/jobs.js';
import { listArcSummaries, listMemories, listTraitChanges } from '../repos/memories.js';
import { getStory, type StoryRecord } from '../repos/stories.js';
import type { GenerationService } from '../services/generation.js';
import { buildStoryDetail } from '../services/story-view.js';

type StoryParams = { Params: { id: string } };
type JobParams = { Params: { id: string; jobId: string } };

export function storyRoutes(app: FastifyInstance, { db, now }: AppDeps, generation: GenerationService): void {
  const requireStory = (id: string): StoryRecord => {
    const story = getStory(db, id);
    if (!story) throw notFound('故事');
    return story;
  };

  app.get<StoryParams>('/api/stories/:id', async (req): Promise<StoryDetail> => buildStoryDetail(db, requireStory(req.params.id)));

  app.get<StoryParams>('/api/stories/:id/chapters', async (req): Promise<ChaptersResponse> => {
    const story = requireStory(req.params.id);
    const { from, limit } = parseInput(chaptersQuerySchema, req.query);
    const start = from ?? Math.max(1, story.chapterCount - limit + 1);
    return { chapters: listChapters(db, story.id, start, limit), total: story.chapterCount };
  });

  app.get<StoryParams>('/api/stories/:id/toc', async (req): Promise<TocResponse> => ({
    items: listToc(db, requireStory(req.params.id).id),
  }));

  app.get<StoryParams>('/api/stories/:id/memory', async (req): Promise<MemoryResponse> => {
    const story = requireStory(req.params.id);
    return {
      items: listMemories(db, story.id),
      traitChanges: listTraitChanges(db, story.id),
      arcSummaries: listArcSummaries(db, story.id),
    };
  });

  app.put<StoryParams>('/api/stories/:id/direction', async (req) => {
    const { text } = parseInput(setDirectionRequestSchema, req.body);
    const direction = transaction(db, () => {
      const story = requireStory(req.params.id);
      // A chapter already being generated keeps its locked direction (T7); the new one starts after it.
      const active = getActiveJobRow(db, story.id);
      const effectiveFrom = (active ? active.target_chapter : story.chapterCount) + 1;
      return setDirection(db, story.id, text, effectiveFrom, now());
    });
    return { direction };
  });

  app.delete<StoryParams>('/api/stories/:id/direction', async (req, reply) => {
    transaction(db, () => clearDirection(db, requireStory(req.params.id).id, now()));
    return reply.code(204).send();
  });

  app.post<StoryParams>('/api/stories/:id/jobs', async (req, reply): Promise<JobResponse> => {
    const { requestId } = parseInput(createJobRequestSchema, req.body);
    const { job, created } = generation.createJob(req.params.id, requestId);
    if (created) generation.enqueue(job.story_id, job.id);
    reply.code(created ? 202 : 200);
    return { job: toJob(db, getJobRow(db, job.story_id, job.id)!) };
  });

  app.get<JobParams>('/api/stories/:id/jobs/:jobId', async (req): Promise<JobResponse> => {
    const row = getJobRow(db, req.params.id, req.params.jobId);
    if (!row) throw notFound('任务');
    return { job: toJob(db, row) };
  });
}
