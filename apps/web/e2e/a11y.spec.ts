import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
}

for (const theme of ['light', 'dark'] as const) {
  for (const tab of ['offers', 'calendar', 'watchlist', 'activity'] as const) {
    test(`${tab} tab has no serious axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/#${tab}`);
      await expect(page.getByRole('tab', { selected: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
}

test('an expanded row and the admin dialog have no serious axe violations', async ({ page }) => {
  await page.goto('/?offer=fx-active-long');
  await expect(page.getByRole('region', { name: /Details for/ })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.keyboard.press('Shift+A');
  await page.keyboard.press('Shift+A');
  await expect(page.getByRole('dialog', { name: 'Enter admin mode' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('the page works at 320px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
