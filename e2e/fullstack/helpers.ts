import { expect, type Page } from '@playwright/test';

export async function resetBackend(page: Page) {
  const res = await page.request.post('/api/__test__/reset');
  expect(res.status()).toBe(204);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function setDirection(page: Page, text: string) {
  await page.getByRole('button', { name: '调整走向' }).click();
  const dialog = page.getByRole('dialog', { name: '调整故事走向' });
  await dialog.getByLabel('希望接下来发生什么？').fill(text);
  await dialog.getByRole('button', { name: '保存走向' }).click();
  await expect(dialog).toBeHidden();
}
