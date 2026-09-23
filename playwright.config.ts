import { defineConfig } from '@playwright/test'

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:4175${base}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone-320', use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
    { name: 'phone-360', use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'phone-430', use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: `http://127.0.0.1:4175${base}`,
    reuseExistingServer: !process.env.CI,
  },
})