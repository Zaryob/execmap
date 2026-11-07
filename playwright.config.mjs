import { defineConfig } from '@playwright/test';
import { normalizeBase } from './src/content.mjs';

const base = normalizeBase(process.env.SITE_BASEURL ?? '/execmap');
const port = Number(process.env.PORT || 4173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `${origin}${base}/`,
    headless: true,
    locale: 'tr-TR',
    colorScheme: 'dark',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm start',
    url: `${origin}${base}/`,
    reuseExistingServer: false,
    timeout: 30000,
    env: { SITE_BASEURL: base, PORT: String(port) },
  },
});
