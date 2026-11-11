import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:true,workers:2,
  use:{baseURL:'http://127.0.0.1:3100',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}},
  webServer:{command:'npx tsx scripts/create-test-tpk.ts && npm run build && npm run start -- --port 3100',url:'http://127.0.0.1:3100',timeout:180000,
    env:{TPK_PATH:resolve('.cache/test-tpk/synthetic-v2.tpk'),TPK_USAGE_CONFIRMED:'true',TPK_CACHE_DIR:resolve('.cache/test-bundles'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false',NEXT_TELEMETRY_DISABLED:'1'},reuseExistingServer:false}
});
