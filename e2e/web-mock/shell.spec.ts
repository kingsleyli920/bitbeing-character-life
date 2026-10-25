import { expect, test } from '@playwright/test';

test('shows the fixture badge from a mocked backend', async ({ page }) => {
  await page.route('**/api/meta', (route) =>
    route.fulfill({ json: { provider: 'fixture', model: 'fixture', modelConfigured: true } }),
  );
  await page.goto('/');
  await expect(page.getByRole('link', { name: '角色人生' })).toBeVisible();
  await expect(page.getByText('Fixture 模式')).toBeVisible();
});
