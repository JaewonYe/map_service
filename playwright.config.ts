import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    }
  },
  webServer: [
    { command: 'node tests/fixtures/tile-server.mjs', url: 'http://127.0.0.1:3101/health', reuseExistingServer: false },
    {
      command: 'npm run build && npm run start -- --port 3100',
      url: 'http://127.0.0.1:3100',
      timeout: 180_000,
      env: { TILE_SERVER_URL: 'http://127.0.0.1:3101', NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: false
    }
  ]
});
