import { expect, type Page, test } from '@playwright/test';
import { resetBackend, setDirection } from '../fullstack/helpers';

// Fixed content only: the fixture model and a freshly reset database. Never real model output.
const shot = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } as const;

test.use({ reducedMotion: 'reduce' });

async function storyWithTwoChapters(page: Page) {
  await page.goto('/characters/zhou-ye');
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();
  await setDirection(page, '让之前失联的朋友重新出现');
  await page.getByRole('button', { name: '继续故事' }).click();
  const chapter2 = page.locator('#chapter-2');
  await expect(chapter2.getByRole('heading', { name: '旧物' })).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('link', { name: '角色人生' })).toBeInViewport();
}

test.beforeEach(async ({ page }) => resetBackend(page));

test('bookshelf', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '阿秀婆，还没有开始' })).toBeVisible();
  await expect(page).toHaveScreenshot('bookshelf.png', { ...shot, fullPage: true });
});

test('reader with chapters and a direction', async ({ page }) => {
  await storyWithTwoChapters(page);
  await page.locator('#chapter-2').scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('reader.png', shot);
});

test('direction dialog', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '调整走向' }).click();
  await expect(page.getByRole('dialog', { name: '调整故事走向' })).toBeVisible();
  await expect(page).toHaveScreenshot('direction-dialog.png', shot);
});

test('import dialog with validation errors', async ({ page }) => {
  await page.goto('/');
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

  test('reader on a phone', async ({ page }) => {
    await storyWithTwoChapters(page);
    await expect(page).toHaveScreenshot('reader-phone.png', shot);
  });

  test('bookshelf on a phone', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: '阿秀婆，还没有开始' })).toBeVisible();
    await expect(page).toHaveScreenshot('bookshelf-phone.png', { ...shot, fullPage: true });
  });
});
