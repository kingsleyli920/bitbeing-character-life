import { expect, test } from '@playwright/test';
import { collectConsoleErrors, resetBackend, segment, setDirection } from './helpers';

test.beforeEach(async ({ page }) => resetBackend(page));

test('open the workspace, start a story, steer it, and find it again after a reload', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await expect(page.getByText('Fixture 模式')).toBeVisible();
  await expect(page.getByRole('heading', { name: '角色卡信息' })).toBeVisible();
  await page.getByRole('navigation', { name: '切换角色' }).getByRole('link', { name: /^周野/ }).click();
  await expect(page.getByRole('list', { name: '周野的角色卡' })).toContainText('经济状态');
  await expect(page.getByRole('list', { name: '周野的角色卡' }).getByText('[推理]').first()).toBeVisible();

  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(page.getByText(/正在写第 1 段/)).toBeVisible();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();
  await expect(segment(page, 1)).toContainText('生活故事序列 1');

  await setDirection(page, '更悲惨一点');
  await expect(page.getByTitle('更悲惨一点')).toBeVisible();
  await page.getByRole('button', { name: '点击继续生成' }).click();
  await expect(segment(page, 2).getByRole('heading', { name: '旧物' })).toBeVisible();
  await expect(segment(page, 2).getByText('本段走向：更悲惨一点')).toBeVisible();
  await expect(segment(page, 2)).toContainText('读者给的走向是「更悲惨一点」');

  await page.reload();
  await expect(page.getByText('共 2 段')).toBeVisible();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();
  await expect(page.getByTitle('更悲惨一点')).toBeVisible();
  await page.getByText(/^记忆/).click();
  await expect(page.getByText('人物', { exact: false }).first()).toBeVisible();

  await page.getByRole('navigation', { name: '切换角色' }).getByRole('link', { name: /^林晚/ }).click();
  await expect(page.getByText('林晚的生活故事还没有开始')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '切换角色' }).getByRole('link', { name: '周野，读到第 2 段' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed segment explains why, keeps earlier segments, and can be retried', async ({ page }) => {
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();

  await setDirection(page, '[fixture:unavailable] 模拟模型服务故障');
  await page.getByRole('button', { name: '点击继续生成' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('第 2 段没有写成：模型服务暂不可用', { timeout: 20_000 });
  await expect(alert).toContainText('尝试了 3 次');
  await expect(segment(page, 1)).toBeVisible();

  await page.getByRole('button', { name: '故事走向' }).click();
  await page.getByRole('button', { name: '清除当前走向' }).click();
  await alert.getByRole('button', { name: '重试' }).click();
  await expect(segment(page, 2).getByRole('heading', { name: '旧物' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
