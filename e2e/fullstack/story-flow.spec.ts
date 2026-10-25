import { expect, test } from '@playwright/test';
import { collectConsoleErrors, resetBackend, setDirection } from './helpers';

test.beforeEach(async ({ page }) => resetBackend(page));

test('pick a character, open the story, steer it, and find it again after a reload', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await expect(page.getByText('Fixture 模式')).toBeVisible();
  await page.getByRole('link', { name: /^周野/ }).click();
  await expect(page).toHaveURL(/\/stories\//);

  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByText(/正在写第 1 章/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();

  await setDirection(page, '让之前失联的朋友重新出现');
  await expect(page.getByTitle('让之前失联的朋友重新出现')).toBeVisible();
  await page.getByRole('button', { name: '继续故事' }).click();
  const chapter2 = page.locator('#chapter-2');
  await expect(chapter2.getByRole('heading', { name: '旧物' })).toBeVisible();
  await expect(chapter2.getByText('本章走向：让之前失联的朋友重新出现')).toBeVisible();
  await expect(chapter2).toContainText('读者给的走向是「让之前失联的朋友重新出现」');

  await page.reload();
  await expect(page.getByText('共 2 章')).toBeVisible();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();
  await expect(page.getByTitle('让之前失联的朋友重新出现')).toBeVisible();
  await page.getByText(/^记忆/).click();
  await expect(page.getByText('人物', { exact: false }).first()).toBeVisible();

  await page.getByRole('link', { name: '← 书架' }).click();
  await expect(page.getByRole('link', { name: '周野，读到第 2 章' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed chapter explains why, keeps earlier chapters, and can be retried', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();

  await setDirection(page, '[fixture:unavailable] 模拟模型服务故障');
  await page.getByRole('button', { name: '继续故事' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('第 2 章没有写成：模型服务暂不可用', { timeout: 20_000 });
  await expect(alert).toContainText('尝试了 3 次');
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();

  await page.getByRole('button', { name: '调整走向' }).click();
  await page.getByRole('button', { name: '清除当前走向' }).click();
  await alert.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('heading', { name: '旧物' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
