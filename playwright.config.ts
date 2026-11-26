import { defineConfig } from '@playwright/test';

/** PW_CHANNEL=msedge usa o Edge instalado (sem baixar navegador). Padrão: Chromium do Playwright. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1400, height: 860 },
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
});
