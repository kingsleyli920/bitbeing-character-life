/**
 * L6 real-model evaluation (docs/SPEC.md §5.1). Drives a real server process over HTTP so the
 * story uses exactly the product's generation and memory pipeline.
 *
 *   npm run eval -- <scenario> [--max-calls N] [--max-cost USD] [--model ID] [--fresh] [--fixture]
 *
 * Resumable: state lives in eval/out/<scenario>/; re-running continues where it stopped.
 * Spend is capped by the server's BUDGET_USD_CAP on the scenario's own database.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { storyMetrics } from './metrics.js';
import { type Scenario, SCENARIOS, type StoryPlan } from './scenarios.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'eval/out');

interface State {
  scenario: string;
  model: string;
  stories: Record<string, string>;
  crashes: Record<string, { jobId: string; status: string; chaptersBefore: number; chaptersAfter: number; callsForJob: number }>;
  branches: Record<string, string>;
  createdAt: string;
}

function args() {
  const [name, ...rest] = process.argv.slice(2);
  const flag = (f: string) => {
    const i = rest.indexOf(f);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  return {
    name,
    maxCalls: Number(flag('--max-calls') ?? Infinity),
    maxCost: flag('--max-cost') ? Number(flag('--max-cost')) : undefined,
    model: flag('--model'),
    fresh: rest.includes('--fresh'),
    fixture: rest.includes('--fixture'),
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

class Server {
  private child: ChildProcess | undefined;
  base = '';
  constructor(
    private readonly dbPath: string,
    private readonly env: Record<string, string>,
    private readonly fixture: boolean,
    private readonly logFile: string,
  ) {}

  async start() {
    const port = await freePort();
    const log = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts', ...(this.fixture ? ['--provider=fixture'] : [])], {
      cwd: ROOT,
      env: { ...process.env, APP_ENV: 'eval', PORT: String(port), DB_PATH: this.dbPath, ...this.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout?.pipe(log);
    this.child.stderr?.pipe(log);
    this.base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 300; i++) {
      if (this.child.exitCode !== null) throw new Error(`服务启动失败，见 ${this.logFile}`);
      try {
        if ((await fetch(`${this.base}/api/health`)).ok) return;
      } catch {
        // not up yet
      }
      await sleep(100);
    }
    throw new Error('服务 30 秒内没有启动');
  }

  async stop(signal: NodeJS.Signals = 'SIGTERM') {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    child.kill(signal);
    await exited;
  }

  async call<T = any>(method: string, p: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await fetch(`${this.base}${p}`, {
      method,
      ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: (text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) as T };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadState(dir: string, name: string, model: string): State {
  const file = path.join(dir, 'state.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as State;
  return { scenario: name, model, stories: {}, crashes: {}, branches: {}, createdAt: new Date().toISOString() };
}

const saveState = (dir: string, state: State) => fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));

let callsThisRun = 0;

async function ensureStory(server: Server, plan: StoryPlan, state: State): Promise<string> {
  if (state.stories[plan.key]) return state.stories[plan.key]!;
  let characterId = plan.character;
  if (plan.character.startsWith('import:')) {
    const content = fs.readFileSync(path.join(ROOT, 'eval/cards', plan.character.slice(7)), 'utf8');
    const res = await server.call('POST', '/api/characters/import', { format: 'json', content });
    if (res.status !== 201) throw new Error(`导入角色失败：${JSON.stringify(res.body)}`);
    characterId = res.body.character.id;
  }
  const res = await server.call('POST', `/api/characters/${characterId}/stories`, { reuseLatest: false });
  if (res.status !== 201) throw new Error(`创建故事失败：${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function applyDirection(server: Server, storyId: string, text: string | null) {
  const story = (await server.call('GET', `/api/stories/${storyId}`)).body;
  if ((story.direction?.text ?? null) === text) return;
  if (text === null) await server.call('DELETE', `/api/stories/${storyId}/direction`);
  else await server.call('PUT', `/api/stories/${storyId}/direction`, { text });
}

async function waitJob(server: Server, storyId: string, jobId: string) {
  for (;;) {
    const { body } = await server.call('GET', `/api/stories/${storyId}/jobs/${jobId}`);
    if (body.job.status !== 'queued' && body.job.status !== 'running') return body.job;
    await sleep(1000);
  }
}

/** Generates chapters until `target`, retrying a failed chapter at most twice with a new request. */
async function writeUntil(server: Server, storyId: string, target: number, plan: StoryPlan | null, label: string) {
  let failures = 0;
  for (;;) {
    const story = (await server.call('GET', `/api/stories/${storyId}`)).body;
    const next = story.chapterCount + 1;
    if (story.chapterCount >= target) return;
    if (callsThisRun >= args().maxCalls) throw new StopRun(`达到本次 --max-calls 上限（${callsThisRun}）`);
    const step = plan?.directions?.filter((d) => d.atChapter <= next).at(-1);
    if (step) await applyDirection(server, storyId, step.text);
    const res = await server.call('POST', `/api/stories/${storyId}/jobs`, { requestId: randomUUID() });
    if (res.status !== 202 && res.status !== 409) throw new Error(`创建任务失败：${JSON.stringify(res.body)}`);
    callsThisRun++;
    const job = await waitJob(server, storyId, res.body.job.id);
    const usage = job.usage;
    console.log(
      `[${label}] 第 ${job.targetChapter} 章 ${job.status}  尝试 ${job.attempts}  ${usage.latencyMs ?? '?'}ms  ` +
        `in ${usage.inputTokens ?? '?'} out ${usage.outputTokens ?? '?'}  $${usage.costUsd ?? '?'}${job.errorCode ? `  ${job.errorCode}: ${job.errorMessage}` : ''}`,
    );
    if (job.status === 'succeeded') {
      failures = 0;
      continue;
    }
    if (job.errorCode === 'BUDGET_EXCEEDED') throw new StopRun('达到本场景的费用上限');
    if (++failures > 2) throw new Error(`第 ${job.targetChapter} 章连续失败 3 次，停止`);
  }
}

class StopRun extends Error {}

async function crashOnce(server: Server, storyId: string, plan: StoryPlan, state: State, dbPath: string) {
  const chaptersBefore = (await server.call('GET', `/api/stories/${storyId}`)).body.chapterCount as number;
  const step = plan.directions?.filter((d) => d.atChapter <= chaptersBefore + 1).at(-1);
  if (step) await applyDirection(server, storyId, step.text);
  const res = await server.call('POST', `/api/stories/${storyId}/jobs`, { requestId: randomUUID() });
  callsThisRun++;
  // Kill while the model call is in flight.
  for (let i = 0; i < 100; i++) {
    const job = (await server.call('GET', `/api/stories/${storyId}/jobs/${res.body.job.id}`)).body.job;
    if (job.status === 'running') break;
    await sleep(50);
  }
  await sleep(args().fixture ? 100 : 3000);
  console.log(`[${plan.key}] 第 ${chaptersBefore + 1} 章生成中，发送 SIGKILL`);
  await server.stop('SIGKILL');
  await server.start();
  const after = (await server.call('GET', `/api/stories/${storyId}`)).body;
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const calls = (db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE job_id = ?').get(res.body.job.id) as { n: number }).n;
  db.close();
  state.crashes[plan.key] = {
    jobId: res.body.job.id,
    status: after.lastJob?.id === res.body.job.id ? after.lastJob.status : 'unknown',
    chaptersBefore,
    chaptersAfter: after.chapterCount,
    callsForJob: calls,
  };
  console.log(`[${plan.key}] 重启后任务状态：${state.crashes[plan.key]!.status}，章数 ${chaptersBefore} → ${after.chapterCount}`);
}

async function runStories(server: Server, scenario: Scenario, state: State, dir: string, dbPath: string) {
  for (const plan of scenario.stories) {
    const storyId = await ensureStory(server, plan, state);
    state.stories[plan.key] = storyId;
    saveState(dir, state);
    if (plan.crashAtChapter && !state.crashes[plan.key]) {
      await writeUntil(server, storyId, plan.crashAtChapter - 1, plan, plan.key);
      await crashOnce(server, storyId, plan, state, dbPath);
      saveState(dir, state);
    }
    await writeUntil(server, storyId, plan.chapters, plan, plan.key);
  }
}

async function exportStory(server: Server, storyId: string, file: string) {
  const res = await server.call('GET', `/api/stories/${storyId}/export.md`);
  if (res.status === 200) fs.writeFileSync(file, res.body as string);
}

async function main() {
  const a = args();
  const scenario = a.name ? SCENARIOS[a.name] : undefined;
  if (!a.name || !scenario) {
    console.error(`用法：npm run eval -- <场景> [--max-calls N] [--max-cost USD] [--model ID] [--fresh] [--fixture]\n可用场景：\n${Object.entries(SCENARIOS).map(([k, s]) => `  ${k.padEnd(10)} ${s.description}`).join('\n')}`);
    process.exit(1);
  }
  if (!a.fixture) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env.local'));
    } catch {
      // fall through to the check below
    }
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('没有 OPENROUTER_API_KEY（.env.local 或环境变量）。没有 key 时可以加 --fixture 只验证流程。');
      process.exit(1);
    }
  }
  const dir = path.join(OUT, a.fixture ? `${a.name}-fixture` : a.name);
  if (a.fresh) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const model = a.model ?? process.env.STORY_MODEL ?? 'anthropic/claude-haiku-5.5';
  const state = loadState(dir, a.name, model);
  if (state.model !== model) {
    console.error(`这个场景之前用的模型是 ${state.model}，要换模型请加 --fresh。`);
    process.exit(1);
  }
  const env: Record<string, string> = { STORY_MODEL: model, BUDGET_USD_CAP: String(a.maxCost ?? scenario.maxCostUsd) };
  if (a.fixture) env.FIXTURE_DELAY_MS = '200';
  const dbPath = path.join(dir, 'app.db');
  const server = new Server(dbPath, env, a.fixture, path.join(dir, 'server.log'));
  await server.start();
  const started = Date.now();
  let stopped: string | null = null;
  try {
    await runStories(server, scenario, state, dir, dbPath);
    for (const group of scenario.branches ?? []) {
      for (const variant of group.variants) {
        const key = `${group.baseKey}-${variant.key}`;
        const branchDb = path.join(dir, `branch-${key}.db`);
        if (!fs.existsSync(branchDb)) {
          // Snapshot the shared history: same chapters, memory and state for every branch.
          const { DatabaseSync } = await import('node:sqlite');
          const src = new DatabaseSync(dbPath);
          src.exec(`VACUUM INTO '${branchDb.replaceAll("'", "''")}'`);
          src.close();
        }
        const branchServer = new Server(branchDb, env, a.fixture, path.join(dir, `server-${key}.log`));
        await branchServer.start();
        try {
          const storyId = state.stories[group.baseKey]!;
          const base = (await branchServer.call('GET', `/api/stories/${storyId}`)).body;
          const target = SCENARIOS[a.name]!.stories.find((s) => s.key === group.baseKey)!.chapters + group.extraChapters;
          if (base.chapterCount < target) await applyDirection(branchServer, storyId, variant.direction);
          state.branches[key] = storyId;
          saveState(dir, state);
          await writeUntil(branchServer, storyId, target, null, key);
          await exportStory(branchServer, storyId, path.join(dir, `${key}.md`));
        } finally {
          await branchServer.stop();
        }
      }
    }
  } catch (err) {
    if (err instanceof StopRun) stopped = err.message;
    else throw err;
  } finally {
    for (const [key, storyId] of Object.entries(state.stories)) await exportStory(server, storyId, path.join(dir, `${key}.md`));
    await server.stop();
  }

  const report = {
    scenario: a.name,
    description: scenario.description,
    model,
    finishedAt: new Date().toISOString(),
    runSeconds: Math.round((Date.now() - started) / 1000),
    stoppedEarly: stopped,
    crashes: state.crashes,
    stories: Object.fromEntries(Object.entries(state.stories).map(([k, id]) => [k, storyMetrics(dbPath, id)])),
    branches: Object.fromEntries(
      Object.entries(state.branches).map(([k, id]) => [k, storyMetrics(path.join(dir, `branch-${k}.db`), id)]),
    ),
  };
  // Branch databases start as copies of the base, so subtract the shared history from their spend.
  const branchExtraCost = Object.entries(report.branches).reduce((sum, [key, m]) => {
    const baseKey = (scenario.branches ?? []).find((g) => key.startsWith(`${g.baseKey}-`))?.baseKey;
    const base = baseKey ? report.stories[baseKey] : undefined;
    return sum + m.costUsd.total - (base?.costUsd.total ?? 0);
  }, 0);
  const totalCost = Object.values(report.stories).reduce((n, m) => n + m.costUsd.total, 0) + branchExtraCost;
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ ...report, totalCostUsd: Number(totalCost.toFixed(5)) }, null, 2));
  const chapters = Object.values(report.stories).reduce((n, m) => n + m.chapters, 0);
  console.log(
    `\n完成 ${a.name}${stopped ? `（提前停止：${stopped}）` : ''}：主线 ${chapters} 章，分支 ${Object.keys(report.branches).length} 个，` +
      `本次 ${callsThisRun} 个任务，场景累计费用 $${totalCost.toFixed(4)}，报告 ${path.relative(ROOT, path.join(dir, 'report.json'))}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
