import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {makeOsmIndex} from '../tests/fixtures/osm-fixture';
const directory=resolve('.cache/test-osm');
await rm(directory,{recursive:true,force:true});await makeOsmIndex(directory);
console.log('CC0 offline OSM renderer fixture prepared');
