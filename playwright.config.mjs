import { defineConfig, devices } from 'playwright/test';

const evidenceDir = process.env.BENCHTOP_EVIDENCE_DIR || 'reference/evidence/benchtop-geometry-regression/latest';

export default defineConfig({
  testDir: './tests/benchtop',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${evidenceDir}/html-report`, open: 'never' }],
    ['json', { outputFile: `${evidenceDir}/results.json` }],
  ],
  use: {
    baseURL: process.env.BENCHTOP_URL || 'https://innatefurniture.co.nz/pages/timber-panels',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  outputDir: `${evidenceDir}/artifacts`,
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1100 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 1000 }, isMobile: true },
    },
  ],
});
