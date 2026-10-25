import { expect, test } from '@playwright/test';
import { collectConsoleErrors, resetBackend } from './helpers';

test.beforeEach(async ({ page }) => resetBackend(page));

test('import a tavern card, read its first chapter, then delete it', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: '导入角色' }).click();
  const dialog = page.getByRole('dialog', { name: '导入角色' });
  await dialog.getByRole('tab', { name: '酒馆卡 JSON' }).click();
  await dialog.getByRole('button', { name: '填入示例' }).click();
  await dialog.getByRole('button', { name: '导入' }).click();

  await expect(page).toHaveURL(/\/stories\//);
  await expect(page.getByRole('heading', { name: '阿泽' })).toBeVisible();
  await expect(page.getByText('阿泽是广州的自由写作者')).toBeVisible();
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();

  await page.getByRole('link', { name: '← 书架' }).click();
  await expect(page.getByRole('link', { name: '阿泽，读到第 1 章' })).toBeVisible();
  await page.getByRole('button', { name: '删除阿泽' }).click();
  await page.getByRole('group', { name: '确认删除阿泽' }).getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('还没有导入角色')).toBeVisible();
  expect(errors).toEqual([]);
});

test('export downloads the whole story as Markdown', async ({ page }) => {
  await page.goto('/characters/song-zhiwei');
  await page.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByRole('heading', { name: '雨夜' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: '导出' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('宋知微的故事.md');
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  expect(text).toContain('# 宋知微的故事');
  expect(text).toContain('## 第1章 雨夜');
});
