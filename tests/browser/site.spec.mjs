import { test, expect } from '@playwright/test';

// Browser behaviour and geometry that a DOM-only test cannot verify.
test('search opens the selected result and highlights the original query', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'execmap / search' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('a').first()).toHaveAttribute('href', /elf-dosyadan-bellege\.html$/);
  await dialog.getByRole('searchbox').fill('p_offset');
  const result = dialog.locator('a[href*="elf-parser-ve-adresler.html"]');
  await expect(result).toHaveAttribute('href', /highlight=p_offset/);
  await result.click();
  await expect(page).toHaveURL(/elf-parser-ve-adresler\.html\?highlight=p_offset$/);
  await expect(page.locator('article mark').first()).toHaveText('p_offset');
  expect(errors).toEqual([]);
});

test('reopening search with the keyboard preserves its original focus target', async ({ page }, testInfo) => {
  await page.goto('./');
  const trigger = testInfo.project.name === 'mobile'
    ? page.getByRole('button', { name: 'Search this site' })
    : page.getByRole('button', { name: 'Search /', exact: true });
  await trigger.click();
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('topic and text filters work together and reset the empty state', async ({ page }) => {
  await page.goto('./');
  const all = await page.locator('[data-catalog-item]:visible').count();
  await page.getByRole('button', { name: 'Runtime', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Filter guides' }).fill('eBPF');
  await expect(page.locator('[data-catalog-item]:visible')).toHaveCount(1);
  await expect(page.locator('[data-catalog-item]:visible')).toContainText('eBPF');
  await page.getByRole('searchbox', { name: 'Filter guides' }).fill('sonucyok999');
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-catalog-item]:visible')).toHaveCount(all);
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('theme choice survives navigation and the compact menu is usable', async ({ page }, testInfo) => {
  await page.goto('./');
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  }
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Labs', exact: true }).click();
  await expect(page).toHaveURL(/laboratuvarlar\/index\.html$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  if (mobile) await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
});

test('copy buttons stay above code and copy the exact source', async ({ page, context }) => {
  const origin = new URL(test.info().project.use.baseURL).origin;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto('laboratuvarlar/sembol-secimi.html');
  const blocks = page.locator('.console-code');
  for (const block of await blocks.all()) {
    const geometry = await block.evaluate(element => ({
      buttonBottom: element.querySelector('button').getBoundingClientRect().bottom,
      codeTop: element.querySelector('pre').getBoundingClientRect().top,
    }));
    expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.codeTop);
  }
  const expected = await blocks.first().locator('code').textContent();
  await blocks.first().getByRole('button', { name: 'Copy code' }).click();
  await expect(blocks.first().getByRole('button', { name: 'Copy code' })).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});

test('reading pages and home do not overflow narrow viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The desktop run checks all viewport widths.');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['./', 'laboratuvarlar/sembol-secimi.html', 'kaynak-kutuphanesi.html']) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(size.document, `${route} at ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
    }
  }
});


test('English content and controls ignore a saved Turkish preference', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zaryob-language', 'tr'));
  await page.goto('rehberler/assembly-okuma.html?lang=tr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('article')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparing to read x86-64 assembly');
  await expect(page.locator('[data-console-language]')).toHaveCount(0);
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'execmap / search' });
  await dialog.getByRole('searchbox').fill('INLINING');
  await expect(dialog.locator('a[href*="derleme-farklari.html"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Copy code' }).first()).toBeVisible();
});
