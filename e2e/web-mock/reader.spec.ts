import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

test('a network failure is retried with the same requestId', async ({ page }) => {
  const { state, storyUrl } = await mockBackend(page, { failFirstJobPost: true });
  await page.goto(storyUrl);
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByText(/正在写第 1 章/)).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toBe(state.posts[0]);
});

test('reloading during generation shows the same job without posting again', async ({ page }) => {
  const { state, storyUrl } = await mockBackend(page);
  await page.goto(storyUrl);
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByText(/正在写第 1 章/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/正在写第 1 章/)).toBeVisible();
  await expect(page.getByRole('button', { name: '正在写…' })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
});

test('the reader fits a phone screen and the sidebar opens as a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { storyUrl } = await mockBackend(page);
  await page.goto(storyUrl);
  await expect(page.getByRole('button', { name: '开始故事' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const sidebar = page.getByRole('complementary', { name: '角色与记忆' });
  await expect(sidebar).not.toBeInViewport();
  await page.getByRole('button', { name: '角色与记忆' }).click();
  await expect(sidebar).toBeInViewport();
});
