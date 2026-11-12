import {resolve} from 'node:path';
import {makeCatalogFixture} from '../tests/fixtures/catalog-fixture';
console.log((await makeCatalogFixture(resolve('.cache/test-catalog'))).configPath);
