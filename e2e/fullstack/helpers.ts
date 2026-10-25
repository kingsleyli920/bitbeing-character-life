import { expect, type Page } from '@playwright/test';

export async function resetBackend(page: Page) {
  const res = await page.request.post('/api/__test__/reset');
  expect(res.status()).toBe(204);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`${msg.text()} @ ${msg.location().url}`));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function setDirection(page: Page, text: string) {
  await page.getByRole('button', { name: '故事走向' }).click();
  const pop = page.getByRole('dialog', { name: '故事走向' });
  await pop.getByLabel('故事走向').fill(text);
  await pop.getByRole('button', { name: '保存走向' }).click();
  await expect(pop).toBeHidden();
}

export const segment = (page: Page, n: number) => page.locator(`#chapter-${n}`);
