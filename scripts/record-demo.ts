/**
 * Records the demo walkthrough (docs/DEMO.md) as a video with captions and a visible cursor.
 * Run it against `npm run demo` (real model, so one new segment costs about $0.005):
 *   npx tsx scripts/record-demo.ts [baseUrl] [--out docs/media/demo.mp4]
 * The waits for the model are kept in the raw recording and sped up 6× in the MP4 (needs ffmpeg).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:5210';
const outArg = process.argv.indexOf('--out');
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1]! : 'docs/media/demo.mp4');
const rawDir = path.resolve('test-results/demo-recording');
const SIZE = { width: 1280, height: 800 };
const SPEEDUP = 6;
/** Captions stay up long enough to read while watching the page. */
const HOLD = 1.5;

/** Caption bar and a fake cursor: Playwright videos show neither the mouse nor narration. */
const OVERLAY = `
(() => {
  const install = () => {
    if (document.getElementById('__demo_caption')) return;
    const cap = document.createElement('div');
    cap.id = '__demo_caption';
    cap.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);max-width:760px;z-index:2147483647;' +
      'background:rgba(28,24,20,.86);color:#fff;font:500 16px/1.5 -apple-system,"PingFang SC",sans-serif;padding:7px 16px;' +
      'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none;transition:opacity .25s;opacity:0;text-align:center';
    document.body.appendChild(cap);
    const cur = document.createElement('div');
    cur.id = '__demo_cursor';
    cur.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;z-index:2147483647;' +
      'background:rgba(200,80,40,.35);border:2px solid rgba(160,60,30,.9);pointer-events:none;transition:transform .12s';
    document.body.appendChild(cur);
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { cur.style.transform = 'scale(.6)'; }, true);
    addEventListener('mouseup', () => { cur.style.transform = 'scale(1)'; }, true);
  };
  window.__caption = (text) => {
    install();
    const cap = document.getElementById('__demo_caption');
    cap.textContent = text;
    cap.style.opacity = text ? '1' : '0';
  };
  if (document.readyState !== 'loading') install(); else addEventListener('DOMContentLoaded', install);
})();
`;

let t0 = Date.now();
const fastSegments: [number, number][] = [];
const now = () => (Date.now() - t0) / 1000;
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

let lastText = '';
async function caption(page: Page, text: string, holdMs = 2600) {
  lastText = text;
  await page.evaluate(`window.__caption(${JSON.stringify(text)})`);
  if (holdMs) await pause(page, holdMs * HOLD);
}

/** Moves the visible cursor to the element, then clicks it. */
async function click(page: Page, target: Locator, opts: { holdMs?: number } = {}) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(page, 250);
  await target.click();
  await pause(page, opts.holdMs ?? 700);
}

async function hover(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
}

async function scrollStory(page: Page, dy: number, steps = 6) {
  const panel = page.locator('.story-panel');
  const box = await panel.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await pause(page, 120);
  }
}

/** Speeds up model waits so the video is not mostly a spinner. */
async function waitFast(page: Page, fn: () => Promise<unknown>) {
  const from = now();
  await fn();
  const to = now();
  if (to - from > 3) fastSegments.push([from + 1, to - 0.5]);
}

const switcher = (page: Page) => page.getByRole('navigation', { name: '切换角色' });

async function main() {
  fs.rmSync(rawDir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: rawDir, size: SIZE }, locale: 'zh-CN' });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  t0 = Date.now();
  try {
    // 1. The workspace.
    await page.goto(`${base}/characters/lin-wan`);
    await page.locator('[data-testid="chapter"]').first().waitFor();
    await pause(page, 800);
    await caption(page, '「角色人生」：导入角色卡，按段连续生成这个人的生活故事', 3200);
    await caption(page, '左边是「角色卡信息」：原文设定，加上 AI 补全的字段', 2400);
    await hover(page, page.locator('.source-tag').first());
    await caption(page, '[推理] 是根据角色卡推断的，[想象] 是补充的细节；故事开始时这些设定就固定下来', 3600);
    await caption(page, '右边是「角色生活故事」：每一段是一个「生活故事序列」，日期和星期由服务端统一推算', 3600);

    // 2. Different voices.
    await caption(page, '5 个预置角色，年龄、城市、职业和叙述形式都不一样', 1200);
    for (const [name, note] of [
      ['周野', '周野：成都外卖骑手、地下乐队鼓手，四川口语的第一人称'],
      ['宋知微', '宋知微：物理老师，日记体，每篇以日期和天气开头'],
      ['陈一帆', '陈一帆：硬件创业者，正文里穿插她发的社交「动态」'],
    ] as const) {
      await click(page, switcher(page).getByRole('link', { name: new RegExp(`^${name}`) }), { holdMs: 1200 });
      await page.locator('[data-testid="chapter"]').first().waitFor();
      await caption(page, note, 1800);
      await scrollStory(page, 500);
      await pause(page, 1200);
    }

    // 3. Direction + live generation (real model).
    await click(page, switcher(page).getByRole('link', { name: /^周野/ }), { holdMs: 1500 });
    await page.locator('[data-testid="chapter"]').first().waitFor();
    await caption(page, '「故事走向」：读者告诉故事接下来往哪里走', 2000);
    await click(page, page.getByRole('button', { name: '故事走向' }));
    const pop = page.getByRole('dialog', { name: '故事走向' });
    await caption(page, '可以直接点作业文档里的示例', 1600);
    await click(page, pop.getByRole('button', { name: '更悲惨一点' }));
    await click(page, pop.getByRole('button', { name: '保存走向' }), { holdMs: 900 });
    await caption(page, '走向从下一段开始生效，已经写好的段落不会改', 2400);
    const before = await page.locator('[data-testid="chapter"]').count();
    await click(page, page.getByRole('button', { name: '点击继续生成' }), { holdMs: 400 });
    await caption(page, '真实模型在后台生成：组装上下文 → 写正文和记忆 → 校验 → 一致性检查 → 一次事务写入', 3000);
    await click(page, page.locator('summary', { hasText: /^记忆/ }).first(), { holdMs: 600 });
    await caption(page, '等待时看看左边的「记忆」：未解决的线索、人物，都标了出自哪几段', 2400);
    await waitFast(page, () => page.locator('[data-testid="chapter"]').nth(before).waitFor({ timeout: 200_000 }));
    await caption(page, '新的一段写好了（这段等待在视频里加速了）', 1800);
    const newest = page.locator('[data-testid="chapter"]').last();
    await newest.scrollIntoViewIfNeeded();
    await scrollStory(page, 1400, 10);
    const dir = newest.locator('summary', { hasText: '本段走向' });
    await click(page, dir, { holdMs: 600 });
    await caption(page, '「本段走向」说明这段是通过哪些具体事件落实“更悲惨一点”的', 3600);

    // 4. Refresh.
    await caption(page, '刷新页面：段落、走向、记忆都在；生成中刷新也不会重复提交', 1400);
    await page.reload();
    await page.locator('[data-testid="chapter"]').first().waitFor();
    await pause(page, 1800);

    // 5. The 101-segment story.
    await click(page, switcher(page).getByRole('link', { name: /^林晚/ }), { holdMs: 1200 });
    await page.locator('[data-testid="chapter"]').first().waitFor();
    await caption(page, '林晚：连续写了 101 段的长故事（第 60 段生成时强杀过服务，重启后接着写）', 2800);
    await click(page, page.getByRole('button', { name: '更多' }));
    await click(page, page.getByRole('menuitem', { name: '目录' }), { holdMs: 1000 });
    const toc = page.getByRole('dialog', { name: /目录/ });
    await caption(page, '目录里每段都有故事内的日期：从 2024 年 6 月的梅雨季，一直写到 2025 年 4 月', 1600);
    const list = toc.locator('.toc');
    for (let i = 0; i < 6; i++) {
      await list.evaluate((el) => el.parentElement?.scrollBy(0, 500));
      await pause(page, 350);
    }
    await click(page, toc.getByRole('button', { name: /第 1 段/ }), { holdMs: 1400 });
    await caption(page, '第 1 段埋下的人和事，到第 90 段以后还会被提起', 2400);
    await click(page, page.locator('summary', { hasText: /^记忆/ }).first(), { holdMs: 600 });
    const arcs = page.locator('summary', { hasText: '卷摘要' });
    await click(page, arcs, { holdMs: 800 });
    await caption(page, '每 10 段一份卷摘要；记忆里的每一条都能点回原文', 3000);

    // 6. Import.
    await click(page, page.getByRole('button', { name: '导入角色' }));
    const dialog = page.getByRole('dialog', { name: '导入角色' });
    await caption(page, '导入支持三种格式：粘贴描述、自定义 JSON、酒馆卡 JSON', 2000);
    await click(page, dialog.getByRole('tab', { name: '酒馆卡 JSON' }));
    await click(page, dialog.getByRole('button', { name: '填入示例' }), { holdMs: 1200 });
    await click(page, dialog.getByRole('button', { name: '导入' }), { holdMs: 1000 });
    await caption(page, '逐字段校验；导入后模型自动补全设定，并标出哪些是推理、哪些是想象', 1500);
    await waitFast(page, () => page.locator('.source-tag').first().waitFor({ timeout: 120_000 }));
    await pause(page, 1500);
    await caption(page, '工程细节（任务幂等、断点恢复、上下文预算、评测数据）见 README 和 docs/', 3500);
    await caption(page, '', 600);
  } finally {
    await context.close();
    await browser.close();
  }
  const raw = fs.readdirSync(rawDir).find((f) => f.endsWith('.webm'));
  if (!raw) throw new Error('没有生成录屏文件');
  const rawPath = path.join(rawDir, raw);
  console.log(`原始录屏：${rawPath}（${now().toFixed(0)} 秒）；最后一条字幕：${lastText}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawPath, ...speedFilter(), '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  console.log(`已写入 ${path.relative(process.cwd(), out)}（${(fs.statSync(out).size / 1e6).toFixed(1)} MB）`);
}

/** ffmpeg filter that plays the model waits at SPEEDUP× and everything else at normal speed. */
function speedFilter(): string[] {
  if (!fastSegments.length) return [];
  const parts: string[] = [];
  const labels: string[] = [];
  let cursor = 0;
  fastSegments.forEach(([a, b], i) => {
    parts.push(`[0:v]trim=${cursor}:${a},setpts=PTS-STARTPTS[n${i}]`, `[0:v]trim=${a}:${b},setpts=(PTS-STARTPTS)/${SPEEDUP}[f${i}]`);
    labels.push(`[n${i}]`, `[f${i}]`);
    cursor = b;
  });
  parts.push(`[0:v]trim=start=${cursor},setpts=PTS-STARTPTS[tail]`);
  labels.push('[tail]');
  return ['-filter_complex', `${parts.join(';')};${labels.join('')}concat=n=${labels.length}:v=1:a=0[out]`, '-map', '[out]'];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
