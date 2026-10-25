import { expect, test } from '@playwright/test';
import { collectConsoleErrors, resetBackend, segment } from './helpers';

test.beforeEach(async ({ page }) => resetBackend(page));

test('import a tavern card, see its completed profile, write a segment, then delete it', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/characters/lin-wan');
  await page.getByRole('button', { name: '导入角色' }).click();
  const dialog = page.getByRole('dialog', { name: '导入角色' });
  await dialog.getByRole('tab', { name: '酒馆卡 JSON' }).click();
  await dialog.getByRole('button', { name: '填入示例' }).click();
  await dialog.getByRole('button', { name: '导入' }).click();

  // The sample card drops prompt-control fields? It has none, so it opens straight away.
  const card = page.getByRole('list', { name: '阿泽的角色卡' });
  await expect(card).toContainText('阿泽是广州的自由写作者');
  await expect(card).toContainText('【Fixture】阿泽的economy');
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();

  await page.getByRole('button', { name: '删除这个导入的角色' }).click();
  await page.getByRole('group', { name: '确认删除阿泽' }).getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('navigation', { name: '切换角色' }).getByRole('link', { name: /^阿泽/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('export downloads the whole story as Markdown', async ({ page }) => {
  await page.goto('/characters/song-zhiwei');
  await page.getByRole('button', { name: '点击开始生成' }).click();
  await expect(segment(page, 1).getByRole('heading', { name: '雨夜' })).toBeVisible();
  await page.getByRole('button', { name: '更多' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '导出全文（Markdown）' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('宋知微的故事.md');
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  expect(text).toContain('# 宋知微的故事');
  expect(text).toContain('雨夜');
});
