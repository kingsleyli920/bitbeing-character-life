import type { Chapter, Direction, Job, MemoryResponse, StoryDetail } from '@cl/shared';
import { http, HttpResponse } from 'msw';
import { makeChapter, makeJob, makeStory, STORY_ID } from './fixtures';
import { server } from './msw';

/**
 * A tiny in-memory story backend for page tests. Jobs complete when `finishJob()` is called, so a
 * test can observe the "generating" state before the chapter appears.
 */
export function installStoryBackend(initial: { story?: Partial<StoryDetail>; chapters?: Chapter[]; memory?: MemoryResponse } = {}) {
  const chapters: Chapter[] = [...(initial.chapters ?? [])];
  let story = makeStory({ chapterCount: chapters.length, version: chapters.length, ...initial.story });
  const posts: { requestId: string }[] = [];
  const directionCalls: { method: string; text?: string }[] = [];
  const memory: MemoryResponse = initial.memory ?? { items: [], traitChanges: [], arcSummaries: [] };
  const chapterQueries: string[] = [];

  server.use(
    http.get(`/api/stories/${STORY_ID}`, () => HttpResponse.json(story)),
    http.get(`/api/stories/${STORY_ID}/memory`, () => HttpResponse.json(memory)),
    http.get(`/api/stories/${STORY_ID}/chapters`, ({ request }) => {
      const url = new URL(request.url);
      chapterQueries.push(url.search);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const from = Number(url.searchParams.get('from') ?? Math.max(1, chapters.length - limit + 1));
      return HttpResponse.json({ chapters: chapters.filter((c) => c.number >= from).slice(0, limit), total: chapters.length });
    }),
    http.post(`/api/stories/${STORY_ID}/jobs`, async ({ request }) => {
      const { requestId } = (await request.json()) as { requestId: string };
      posts.push({ requestId });
      if (story.activeJob) {
        return HttpResponse.json({ code: 'JOB_IN_PROGRESS', message: '正在生成', job: story.activeJob }, { status: 409 });
      }
      const job = makeJob({ id: `job-${posts.length}`, requestId, targetChapter: story.chapterCount + 1, directionId: story.direction?.id ?? null, startedAt: new Date().toISOString() });
      story = { ...story, activeJob: job };
      return HttpResponse.json({ job }, { status: 202 });
    }),
    http.put(`/api/stories/${STORY_ID}/direction`, async ({ request }) => {
      const { text } = (await request.json()) as { text: string };
      directionCalls.push({ method: 'PUT', text });
      const direction: Direction = { id: `dir-${directionCalls.length}`, text, createdAt: new Date().toISOString(), effectiveFromChapter: (story.activeJob?.targetChapter ?? story.chapterCount) + 1 };
      story = { ...story, direction };
      return HttpResponse.json({ direction });
    }),
    http.delete(`/api/stories/${STORY_ID}/direction`, () => {
      directionCalls.push({ method: 'DELETE' });
      story = { ...story, direction: null };
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return {
    posts,
    directionCalls,
    chapterQueries,
    get story() {
      return story;
    },
    /** Completes the active job: success adds a chapter, otherwise records the failure. */
    finishJob(outcome: Partial<Job> = { status: 'succeeded' }) {
      const job = story.activeJob;
      if (!job) throw new Error('no active job');
      const done: Job = { ...job, finishedAt: new Date().toISOString(), ...outcome };
      if (done.status === 'succeeded') {
        chapters.push(makeChapter(job.targetChapter, { direction: story.direction ? { id: story.direction.id, text: story.direction.text } : null }));
        story = { ...story, chapterCount: chapters.length, version: story.version + 1 };
      }
      story = { ...story, activeJob: null, lastJob: done };
    },
  };
}
