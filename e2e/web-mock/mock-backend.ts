import type { Page, Route } from '@playwright/test';

const STORY_ID = 'story-1';
const now = () => new Date().toISOString();

const card = {
  name: '周野',
  age: '27 岁',
  identity: '外卖骑手，地下乐队鼓手',
  background: '成都外卖骑手，地下乐队「泥巴」的鼓手，想办一场专场。',
  personality: '嘴贫讲义气',
  narrativeStyle: 'novel',
};

function job(over: Record<string, unknown>) {
  return {
    id: 'job-1',
    storyId: STORY_ID,
    requestId: '00000000-0000-4000-8000-000000000001',
    status: 'running',
    targetChapter: 1,
    directionId: null,
    model: 'fixture',
    promptVersion: 'chapter-v2',
    attempts: 1,
    errorCode: null,
    errorMessage: null,
    warnings: [],
    createdAt: now(),
    startedAt: now(),
    finishedAt: null,
    usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, costSource: 'unknown', latencyMs: null },
    ...over,
  };
}

/** Stateful mock of the story API for frontend-only browser tests. */
export async function mockBackend(page: Page, opts: { failFirstJobPost?: boolean } = {}) {
  const state = { activeJob: null as null | ReturnType<typeof job>, posts: [] as string[], aborted: 0 };
  const story = () => ({
    id: STORY_ID,
    characterId: 'zhou-ye',
    card,
    profile: { status: 'ready', profile: { fields: [{ key: 'name', value: '周野', source: 'original', reason: '' }], model: 'fixture', createdAt: now() }, error: null },
    profileFrozen: false,
    state: null,
    chapterCount: 0,
    version: 0,
    direction: null,
    activeJob: state.activeJob,
    lastJob: state.activeJob,
    otherStories: [],
    createdAt: now(),
    updatedAt: now(),
  });
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

  await page.route('**/api/characters', (r) => json(r, { characters: [] }));
  await page.route('**/api/meta', (r) => json(r, { provider: 'fixture', model: 'fixture', modelConfigured: true, budget: { capUsd: 5, spentUsd: 0 } }));
  await page.route(`**/api/stories/${STORY_ID}`, (r) => json(r, story()));
  await page.route(`**/api/stories/${STORY_ID}/memory`, (r) => json(r, { items: [], traitChanges: [], arcSummaries: [] }));
  await page.route(`**/api/stories/${STORY_ID}/chapters**`, (r) => json(r, { chapters: [], total: 0 }));
  await page.route(`**/api/stories/${STORY_ID}/jobs`, async (r) => {
    const { requestId } = r.request().postDataJSON() as { requestId: string };
    state.posts.push(requestId);
    if (opts.failFirstJobPost && state.aborted === 0) {
      state.aborted++;
      return r.abort('connectionreset');
    }
    state.activeJob = job({ requestId });
    return json(r, { job: state.activeJob }, 202);
  });
  return { state, storyUrl: `/stories/${STORY_ID}` };
}
