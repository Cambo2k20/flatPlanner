import { test, expect } from '@playwright/test';

const csv = 'name,shape,width_cm,depth_cm,height_cm,room\nTest appliance,not-a-model,44,34,26,Kitchen\n';
async function importCsv(page, content = csv) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'items.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/#/catalogue');
  await page.getByRole('button', { name: 'Mine', exact: true }).click();
});

test('reviews unknown shapes, cancels without saving, then saves a chosen model', async ({ page }, testInfo) => {
  await importCsv(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Row 2: Test appliance');
  await expect(dialog).toContainText('not-a-model');
  await expect(dialog).toContainText('44 × 34 × 26 cm');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('import-review.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#cat-grid')).not.toContainText('Test appliance');
  await importCsv(page);
  await dialog.getByLabel('3D shape for row 2').selectOption('microwave');
  await dialog.getByRole('button', { name: 'Import 1 item', exact: true }).click();
  await expect(page.locator('#cat-grid')).toContainText('Test appliance');
  await page.reload();
  await expect(page.locator('#cat-grid')).toContainText('Test appliance');
  await page.locator('#cat-grid').getByRole('button').filter({ hasText: 'Test appliance' }).click();
  await expect(dialog.getByLabel('3D shape', { exact: false }).first()).toHaveValue('microwave');
});

test('allows explicit block fallback and imports known shapes directly', async ({ page }) => {
  await importCsv(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Import 1 item', exact: true }).click();
  await expect(page.locator('#cat-grid')).toContainText('Test appliance');
  await importCsv(page, 'name,shape\nKnown microwave,microwave\n');
  await expect(page.locator('#cat-grid')).toContainText('Known microwave');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
