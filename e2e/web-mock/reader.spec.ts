import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

test('a network failure is retried with the same requestId', async ({ page }) => {
  const { state, storyUrl } = await mockBackend(page, { failFirstJobPost: true });
  await page.goto(storyUrl);
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(page.getByText(/正在写第 1 段/)).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toBe(state.posts[0]);
});

test('reloading during generation shows the same job without posting again', async ({ page }) => {
  const { state, storyUrl } = await mockBackend(page);
  await page.goto(storyUrl);
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(page.getByText(/正在写第 1 段/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/正在写第 1 段/)).toBeVisible();
  await expect(page.getByRole('button', { name: '正在生成第 1 段…' })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
});

test('the workspace fits a phone screen and the card info folds open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { storyUrl } = await mockBackend(page);
  await page.goto(storyUrl);
  await expect(page.getByRole('button', { name: '点击开始生成' })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const card = page.getByRole('list', { name: '周野的角色卡' });
  await expect(card).toBeHidden();
  await page.getByRole('button', { name: '展开' }).click();
  await expect(card).toBeVisible();
});
