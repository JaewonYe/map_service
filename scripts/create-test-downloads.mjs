import {rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const path=resolve('.cache/test-downloads');
await rm(path,{recursive:true,force:true});await mkdir(path,{recursive:true});
