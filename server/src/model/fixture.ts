import { type ChapterDraft, LIFE_AREAS } from '@cl/shared';
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse } from './provider.js';

const TITLES = ['雨夜', '旧物', '来信', '争执', '和解', '远行', '夜班', '重逢', '告别', '清晨', '集市', '台风'];
const PLACES = ['家里', '街角的小店', '车站', '老街', '江边', '天台'];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ModelError('MODEL_TIMEOUT', '模型响应超时'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ModelError('MODEL_TIMEOUT', '模型响应超时'));
    });
  });
}

/** Deterministic chapter content for tests and offline demos. Not AI output. */
export function fixtureDraft(req: ModelRequest): ChapterDraft {
  const { chapterNumber: n, characterName: name, directionText, knownKeys } = req.trace;
  const title = `${TITLES[(n - 1) % TITLES.length]}${n > TITLES.length ? `（${Math.ceil(n / TITLES.length)}）` : ''}`;
  const place = PLACES[n % PLACES.length]!;
  const paragraphs = [
    `【Fixture 第 ${n} 段】这是确定性的测试文本，不是 AI 生成的故事。`,
    `${name}在${place}度过了这一天。早上的风有点凉，${name}把外套的拉链拉到下巴，想着昨天没说完的那句话。`,
    `配角${(n % 4) + 1}号走过来，问${name}最近怎么样。${name}笑了笑，说还行，又把话题岔开了。`,
    directionText ? `这一段，读者给的走向是「${directionText}」，于是${name}遇到了一件和它有关的具体事情，并且承担了后果。` : `${name}按照自己的节奏生活，没有人催促。`,
    `傍晚的时候，${name}在${place}门口站了很久，最后决定明天再试一次。`.repeat(3),
    `这一段用来凑足字数，保证正文长度合规。`.repeat(12),
  ];
  const openThread = knownKeys.find((k) => k.startsWith('线索'));
  const memoryOps: ChapterDraft['memoryOps'] = [
    { op: 'upsert', kind: 'person', key: `配角${(n % 4) + 1}号`, content: `${name}的熟人，第${n}章又出现了`, importance: 1, status: 'active' },
  ];
  if (n % 3 === 0) memoryOps.push({ op: 'upsert', kind: 'thread', key: `线索${n}`, content: `第${n}章留下的悬念`, importance: 2, status: 'open' });
  if (n % 5 === 0 && openThread) memoryOps.push({ op: 'resolve', kind: 'thread', key: openThread, content: `在第${n}章解决`, importance: 2, status: 'resolved' });
  return {
    title,
    storyTime: `第${n}天`,
    storyDate: new Date(Date.UTC(2026, 5, 1) + (n - 1) * 2 * 86_400_000).toISOString().slice(0, 10),
    location: place,
    body: paragraphs.join('\n\n'),
    summary: `第${n}章：${name}在${place}度过一天，和配角${(n % 4) + 1}号聊了几句，决定明天再试一次。${directionText ? `走向「${directionText}」有所推进。` : ''}`,
    beatTags: [`日常${n % 7}`],
    lifeAreas: [LIFE_AREAS[n % LIFE_AREAS.length]!],
    state: { time: `第${n}天傍晚`, location: place, situation: '平静地生活', goals: ['明天再试一次'], mood: '平静' },
    memoryOps,
    traitChanges: n % 20 === 0 ? [{ trait: '耐心', from: '急躁', to: '沉得住气', causeChapters: [n - 1, n], explanation: '连续几次受挫后学会了等待' }] : [],
    directionHandling: directionText ? { applied: true, how: `安排了一件与「${directionText}」有关的具体事情`, adjustments: null } : null,
  };
}

export function createFixtureProvider(opts: { delayMs: number }): ModelProvider {
  return {
    name: 'fixture',
    configured: true,
    async complete(req: ModelRequest): Promise<ModelResponse> {
      await sleep(opts.delayMs, req.signal);
      const directive = req.trace.directionText ?? '';
      // Test hooks for full-stack error-state tests; only reachable with MODEL_PROVIDER=fixture.
      if (directive.includes('[fixture:unavailable]')) throw new ModelError('MODEL_UNAVAILABLE', '模型服务暂不可用（fixture）');
      if (directive.includes('[fixture:refuse]')) throw new ModelError('MODEL_REFUSED', '模型拒绝生成这段内容（fixture）');
      if (req.purpose === 'profile') {
        const fields = ['age', 'gender', 'language', 'occupation', 'economy', 'relationship', 'residence', 'appearance', 'signature', 'routine', 'hobbies', 'speech'].map(
          (key, i) => ({ key, value: `【Fixture】${req.trace.characterName}的${key}`, source: i < 3 ? 'original' : i % 2 ? 'inferred' : 'imagined', reason: i < 3 ? '' : '测试数据' }),
        );
        return { text: JSON.stringify({ fields }), finishReason: 'stop', provider: 'fixture', usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, costSource: 'unknown' } };
      }
      const text =
        req.purpose === 'consistency'
          ? JSON.stringify({ issues: [] })
          : req.purpose === 'arc_summary'
          ? JSON.stringify({ summary: `【Fixture 卷摘要】截至第 ${req.trace.chapterNumber - 1} 章，${req.trace.characterName}的生活按部就班地推进，几条线索仍在展开。` })
          : JSON.stringify(fixtureDraft(req));
      return {
        text,
        finishReason: 'stop',
        provider: 'fixture',
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, costSource: 'unknown' },
      };
    },
  };
}
