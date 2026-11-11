import {resolve} from 'node:path';
import {makeTpk} from '../tests/fixtures/tpk-fixture';
console.log((await makeTpk(resolve('.cache/test-tpk'),2)).path);
