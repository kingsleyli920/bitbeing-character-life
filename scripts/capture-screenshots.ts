/**
 * Captures the documentation screenshots from a running app (normally `npm run demo`, so the
 * pictures show real model output rather than fixture text).
 *   npx tsx scripts/capture-screenshots.ts [baseUrl]
 */
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5210';
const out = (name: string) => path.join(import.meta.dirname, '../docs/images', name);

async function open(page: Page, characterId: string) {
  await page.goto(`${base}/characters/${characterId}`);
  await page.getByRole('heading', { name: '角色生活故事' }).waitFor();
  await page.locator('[data-testid="chapter"]').first().waitFor();
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await open(desktop, 'lin-wan');
  await desktop.screenshot({ path: out('workspace.png') });

  await desktop.getByText(/^记忆/).click();
  await desktop.locator('.memory-group summary', { hasText: '人物' }).click();
  await desktop.locator('.memory-panel').scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: out('workspace-memory.png') });

  await open(desktop, 'zhou-ye');
  await desktop.getByRole('button', { name: '故事走向' }).click();
  await desktop.getByRole('dialog', { name: '故事走向' }).waitFor();
  await desktop.screenshot({ path: out('direction-popover.png') });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await open(phone, 'song-zhiwei');
  await phone.evaluate('window.scrollTo(0, 0)');
  await phone.screenshot({ path: out('phone.png') });
} finally {
  await browser.close();
}
console.log('截图已写入 docs/images/');
