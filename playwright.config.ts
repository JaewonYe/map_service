import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:true,workers:2,
  use:{baseURL:'http://127.0.0.1:3100',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}},
  projects:[
    {name:'single',testMatch:'map.spec.ts',use:{baseURL:'http://127.0.0.1:3100'}},
    {name:'multi',testMatch:['catalog.spec.ts','measure.spec.ts'],use:{baseURL:'http://127.0.0.1:3101'}},
    {name:'layers',testMatch:'layers.spec.ts',use:{baseURL:'http://127.0.0.1:3103'}},
    {name:'buildings',testMatch:'buildings.spec.ts',use:{baseURL:'http://127.0.0.1:3102'}}
  ],
  webServer:[
    {command:'npx tsx scripts/create-test-tpk.ts && npx tsx scripts/create-test-catalog.ts && node scripts/create-test-buildings.mjs && npx tsx scripts/create-test-layers.ts && npm run build && npm run start -- --port 3100',url:'http://127.0.0.1:3100',timeout:180000,
      env:{BUILDINGS_DIR:resolve('.cache/test-building-data/single'),MAP_CONFIG_FILE:'maps.json',TPK_PATH:resolve('.cache/test-tpk/synthetic-v2.tpk'),TPK_USAGE_CONFIRMED:'true',TPK_CACHE_DIR:resolve('.cache/test-bundles'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false',NEXT_TELEMETRY_DISABLED:'1'},reuseExistingServer:false},
    {command:'npm run start -- --port 3101',url:'http://127.0.0.1:3101',timeout:60000,
      env:{BUILDINGS_DIR:resolve('.cache/test-building-data/multi'),MAP_CONFIG_FILE:'maps.json',TPK_PATH:resolve('.cache/test-catalog/map.tpk'),TPK_USAGE_CONFIRMED:'false',TPK_CACHE_DIR:resolve('.cache/test-catalog-bundles'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false',NEXT_TELEMETRY_DISABLED:'1'},reuseExistingServer:false},
    {command:'npm run start -- --port 3102',url:'http://127.0.0.1:3102',timeout:60000,
      env:{BUILDINGS_DIR:resolve('.cache/test-building-data/buildings'),MAP_CONFIG_FILE:'maps.json',TPK_PATH:resolve('.cache/test-catalog/map.tpk'),TPK_USAGE_CONFIRMED:'false',TPK_CACHE_DIR:resolve('.cache/test-catalog-bundles'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false',NEXT_TELEMETRY_DISABLED:'1'},reuseExistingServer:false},
    {command:'npm run start -- --port 3103',url:'http://127.0.0.1:3103',timeout:60000,
      env:{BUILDINGS_DIR:resolve('.cache/test-building-data/layers'),MAP_CONFIG_FILE:'maps.json',TPK_PATH:resolve('.cache/test-catalog/map.tpk'),TPK_CACHE_DIR:resolve('.cache/test-layers/bundles'),
        STREET_TPK_DIR:resolve('.cache/test-layers/street'),STREET_USAGE_CONFIRMED:'true',ELEVATION_DIR:resolve('.cache/test-layers/elevation'),
        MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false',NEXT_TELEMETRY_DISABLED:'1'},reuseExistingServer:false}
  ]
});
