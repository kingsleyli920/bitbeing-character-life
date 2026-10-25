import { expect, type Page, test } from '@playwright/test';
import { resetBackend, segment, setDirection } from '../fullstack/helpers';

// Fixed content only: the fixture model and a freshly reset database. Never real model output.
const shot = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } as const;

test.use({ reducedMotion: 'reduce' });

async function storyWithTwoSegments(page: Page) {
  await page.goto('/characters/zhou-ye');
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();
  await setDirection(page, '更悲惨一点');
  await page.getByRole('button', { name: '点击继续生成' }).click();
  await expect(segment(page, 2).getByRole('heading', { name: '旧物' })).toBeInViewport();
}

test.beforeEach(async ({ page }) => resetBackend(page));

test('workspace before the story starts', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await expect(page.getByText('林晚的生活故事还没有开始')).toBeVisible();
  await expect(page).toHaveScreenshot('workspace-empty.png', shot);
});

test('workspace with segments and a direction', async ({ page }) => {
  await storyWithTwoSegments(page);
  await expect(page).toHaveScreenshot('workspace.png', shot);
});

test('direction popover', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '故事走向' }).click();
  await expect(page.getByRole('dialog', { name: '故事走向' })).toBeVisible();
  await expect(page).toHaveScreenshot('direction-popover.png', shot);
});

test('import dialog with validation errors', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '导入角色' }).click();
  const dialog = page.getByRole('dialog', { name: '导入角色' });
  await dialog.getByRole('tab', { name: '自定义 JSON' }).click();
  await dialog.getByLabel(/粘贴角色卡 JSON/).fill('{"name": "", "background": "太短"}');
  await dialog.getByRole('button', { name: '导入' }).click();
  await expect(dialog.getByRole('alert', { name: '校验问题' })).toBeVisible();
  await expect(page).toHaveScreenshot('import-errors.png', shot);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('workspace on a phone', async ({ page }) => {
    await storyWithTwoSegments(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('link', { name: '角色人生' })).toBeInViewport();
    await expect(page).toHaveScreenshot('workspace-phone.png', shot);
  });
});
