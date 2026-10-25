import { expect, test } from '@playwright/test';

test('loads the app against the real backend', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto('/');
  await expect(page.getByRole('link', { name: '角色人生' })).toBeVisible();
  await expect(page.getByText('Fixture 模式')).toBeVisible();
  expect(errors).toEqual([]);
});
