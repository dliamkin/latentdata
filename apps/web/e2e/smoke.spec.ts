import { expect, test } from '@playwright/test';

test('tabs sync with the hash and the back button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Offers', selected: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/#calendar$/);
  await expect(page.getByRole('heading', { name: /Open on/ })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Offers', selected: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('summary buttons filter the table and the live region announces the count', async ({
  page,
}) => {
  await page.goto('/');
  const rows = page.locator('tr:has([data-offer-id])');
  await expect(rows).toHaveCount(6);

  await page.getByRole('button', { name: /Evergreen/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('live-region')).toHaveText('2 offers shown');

  await page.getByRole('searchbox', { name: 'Search offers' }).fill('Fixture AI');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('live-region')).toHaveText('1 offer shown');
});

test('a row expands to show its details and notes', async ({ page }) => {
  await page.goto('/');
  await page.locator('tr:has([data-offer-id="fx-active-long"]) .p-row-toggler').click();
  const region = page.getByRole('region', {
    name: 'Details for Fixture Cloud Architect exam voucher',
  });
  await expect(region).toBeVisible();
  await expect(region).toContainText('Register with a work email.');
  await region.getByLabel('My notes').fill('booked for Friday');
  await expect(page.getByTestId('live-region')).toHaveText('Saved');
});

test('a deep link reveals an expired row, expands it and moves focus to it', async ({ page }) => {
  await page.goto('/?offer=fx-expired');
  await expect(page.getByRole('tab', { name: 'Offers', selected: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /Details for Fixture Data Engineer/ }),
  ).toBeVisible();
  const focused = await page.evaluate(
    () =>
      document.activeElement?.querySelector('[data-offer-id]')?.getAttribute('data-offer-id') ??
      null,
  );
  expect(focused).toBe('fx-expired');
});

test('the admin dialog opens on Shift+A twice and cancel restores focus', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('theme-toggle');
  await toggle.focus();
  await page.keyboard.press('Shift+A');
  await page.keyboard.press('Shift+A');
  const dialog = page.getByRole('dialog', { name: 'Enter admin mode' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign in' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('the theme toggle swaps the stylesheet and persists', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'light' });
  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByTestId('theme-toggle').click();
  const after = await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.locator('html').getAttribute('data-theme')).toBe(after);
});

test('the certifications tab prices credentials and links the offer that covers one', async ({
  page,
}) => {
  await page.goto('/#catalog');
  const cloud = page.getByRole('region', { name: 'Cloud' });
  await expect(cloud.getByText('Free now')).toBeVisible();
  await expect(cloud.getByText('$200', { exact: true })).toBeVisible();
  await expect(cloud.getByText('Saves $200 today')).toBeVisible();

  await cloud.getByRole('button', { name: /Fixture Cloud Architect exam voucher/ }).click();
  await expect(page.getByRole('tab', { name: 'Offers', selected: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /Details for Fixture Cloud Architect/ }),
  ).toBeVisible();
});

test('the audience lens narrows every tab at once', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('tr:has([data-offer-id])');
  await expect(rows).toHaveCount(6);

  await page.getByRole('group', { name: 'Who the offers are for' }).getByText('Software').click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('tab', { name: /Certifications/ })).toContainText('3');

  await page.getByRole('tab', { name: /Certifications/ }).click();
  await expect(page.getByRole('heading', { name: /What people ask for/ })).toContainText('3');
});

test('saying who you are hides what you cannot claim, and survives a reload', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('tr:has([data-offer-id])');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('Normally $200');
  await expect(rows.first()).toContainText(/Checked/);

  const who = page.getByRole('group', { name: 'Who you are' });
  await who.getByRole('button', { name: 'A student' }).click();
  await expect(rows).toHaveCount(4);
  await expect(who.getByRole('status')).toHaveText('3 hidden');

  await page.reload();
  await expect(rows).toHaveCount(4);
  await expect(who.getByRole('button', { name: 'A student' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the footer opens the doc pages and the back button returns', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Copyright © 2026');

  await footer.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/#privacy$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Privacy' })).toBeVisible();
  // a doc page replaces the tab bar rather than sitting inside it
  await expect(page.getByRole('tab')).toHaveCount(0);

  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Offers', selected: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  await footer.getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/#architecture$/);
  await expect(page.getByRole('heading', { level: 2, name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('img', { name: /top-to-bottom pipeline/ })).toBeVisible();
});
